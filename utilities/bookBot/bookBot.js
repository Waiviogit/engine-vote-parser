const {
  BOOK_BOTS, POOL_FEE, BOOK_EMITTER_EVENTS, REDIS_BOOK, HIVE_PEGGED_PRECISION,
} = require('constants/bookBot');
const engineMarket = require('utilities/hiveEngine/market');
const enginePool = require('utilities/hiveEngine/marketPools');
const tokensContract = require('utilities/hiveEngine/tokensContract');
const broadcastUtil = require('utilities/hiveApi/broadcastUtil');
const BigNumber = require('bignumber.js');
const _ = require('lodash');
const { MARKET_CONTRACT } = require('constants/hiveEngine');
const { calculateRcPercent } = require('utilities/hiveApi/hiveOperations');
const redisGetter = require('utilities/redis/redisGetter');
const redisSetter = require('utilities/redis/redisSetter');
const poolSwapHelper = require('./poolSwapHelper');
const bookEmitter = require('./bookEvents');
const {
  getQuantityToBuy,
  getFormattedBalance,
  getPrecisionPrice,
  getDieselPoolPrice,
  getLimitBuyParams,
  getLimitSellParams,
  getMarketBuyParams,
  getMarketSellParams,
  getCancelParams,
  orderQuantity,
  orderCondition,
  getSwapParams,
  handleOpenOrders,
  countTotalBalance,
} = require('./bookHelpers');

exports.sendBookEvent = async ({ symbol, event }) => {
  const bookBot = _.find(BOOK_BOTS, (bot) => bot.symbol === symbol);
  if (!bookBot) return;
  await handleBookEvent({ bookBot, event });
};

const handleBookEvent = async ({ bookBot, event }) => {
  const operations = [];
  const { result: rcLeft } = await calculateRcPercent(bookBot.account);

  const balances = await tokensContract.getTokenBalances({
    query: { symbol: { $in: ['SWAP.HIVE', bookBot.symbol] }, account: bookBot.account },
  });

  const token = await tokensContract.getTokensParams({ query: { symbol: bookBot.symbol } });
  const buyBook = await engineMarket.getBuyBook({ query: { symbol: bookBot.symbol } });
  const sellBook = await engineMarket.getSellBook({ query: { symbol: bookBot.symbol } });
  const marketPools = await enginePool
    .getMarketPools({ query: { tokenPair: bookBot.tokenPair } });
  const params = await enginePool.getMarketPoolsParams();
  const tradeFeeMul = _.get(params, '[0].tradeFeeMul', POOL_FEE);

  const dieselPool = _.get(marketPools, '[0]');
  if (_.isEmpty(dieselPool)) return;

  const tokenPrecision = _.get(token, '[0].precision', 8);

  const swapBalance = getFormattedBalance(balances);
  const symbolBalance = getFormattedBalance(balances, bookBot.symbol);

  const swapTotalBalance = countTotalBalance({
    book: buyBook,
    hivePegged: true,
    botName: bookBot.account,
    precision: HIVE_PEGGED_PRECISION,
    balance: swapBalance,
  });

  const symbolTotalBalance = countTotalBalance({
    book: sellBook,
    botName: bookBot.account,
    precision: tokenPrecision,
    balance: symbolBalance,
  });

  const buyPrice = _.get(buyBook, '[0].price', '0');
  const sellPrice = _.get(sellBook, '[0].price', '0');
  const poolPrice = getDieselPoolPrice({ dieselPool, bookBot });
  const buyPriceIsMine = _.get(buyBook, '[0].account') === bookBot.account;
  const sellPriceIsMine = _.get(sellBook, '[0].account') === bookBot.account;

  const poolPriceFee = BigNumber(poolPrice).times(BigNumber(1).minus(tradeFeeMul)).toFixed();

  const nextBuyPrice = BigNumber(buyPrice).plus(getPrecisionPrice(tokenPrecision)).toFixed();
  const nextSellPrice = BigNumber(sellPrice).minus(getPrecisionPrice(tokenPrecision)).toFixed();

  const nextBuyPriceFee = BigNumber(nextBuyPrice).plus(poolPriceFee).toFixed();
  const nextSellPriceFee = BigNumber(nextSellPrice).minus(poolPriceFee).toFixed();

  const createBuyOrderCondition = BigNumber(nextBuyPriceFee).lt(poolPrice);
  const createSellOrderCondition = BigNumber(poolPrice).lt(nextSellPriceFee);

  const maxBuyQuantity = poolSwapHelper.maxQuantityBookOrder({
    pool: dieselPool,
    type: MARKET_CONTRACT.BUY,
    price: nextBuyPrice,
    tradeFeeMul,
  });
  const maxSellQuantity = poolSwapHelper.maxQuantityBookOrder({
    pool: dieselPool,
    type: MARKET_CONTRACT.SELL,
    price: nextSellPrice,
    tradeFeeMul,
  });

  const marketBuyCondition = BigNumber(sellPrice).lt(poolPrice)
    && !BigNumber(sellPrice).eq(0);

  const marketSellCondition = BigNumber(buyPrice).gt(poolPrice)
    && !BigNumber(buyPrice).eq(0);

  if (rcLeft && !event) {
    // #TODO change exit conditions
    const { exit } = handleBotRc({
      rcLeft, bookBot, buyBook, sellBook,
    });
    if (exit) return;
  }

  if (event) {
    return handleDeal({
      bookBot, dieselPool, event, tradeFeeMul,
    });
  }

  if (marketSellCondition) {
    // #TODO symbolBalance count properly its current balance not frozen
    return handleMarketSell({
      symbolBalance, tokenPrecision, bookBot, buyBook, maxSellQuantity,
    });
  }

  if (marketBuyCondition) {
    // #TODO swapBalance count properly its current balance not frozen
    return handleMarketBuy({
      sellPrice, swapBalance, tokenPrecision, bookBot, maxBuyQuantity, sellBook,
    });
  }

  if (!buyPriceIsMine && createBuyOrderCondition) {
    const previousOrder = _.find(buyBook, (order) => order.account === bookBot.account);
    if (previousOrder) {
      operations.push(getCancelParams({
        id: _.get(previousOrder, 'txId'),
        type: MARKET_CONTRACT.BUY,
      }));
    }
    const ourQuantityToBuy = getQuantityToBuy({
      price: nextBuyPrice,
      total: BigNumber(swapBalance).times(bookBot.percentSwap).toFixed(),
      precision: tokenPrecision,
    });

    const finalQuantity = orderQuantity({
      ourQuantity: ourQuantityToBuy, maxQuantity: maxBuyQuantity,
    });

    orderCondition(finalQuantity) && operations.push(getLimitBuyParams({
      symbol: bookBot.symbol,
      price: nextBuyPrice,
      quantity: finalQuantity,
    }));
  }

  if (buyPriceIsMine) {
    const previousBuyPrice = _.get(buyBook, '[1].price', '0');
    const conditionToCancelOrder = BigNumber(buyPrice).minus(previousBuyPrice)
      .gt(getPrecisionPrice(tokenPrecision));

    if (conditionToCancelOrder) {
      operations.push(getCancelParams({
        id: _.get(buyBook, '[0].txId'),
        type: MARKET_CONTRACT.BUY,
      }));

      if (createBuyOrderCondition) {
        const ourQuantityToBuy = getQuantityToBuy({
          price: BigNumber(previousBuyPrice).plus(getPrecisionPrice(tokenPrecision)),
          total: BigNumber(swapBalance).times(bookBot.percentSwap).toFixed(),
          precision: tokenPrecision,
        });

        const finalQuantity = orderQuantity({
          ourQuantity: ourQuantityToBuy, maxQuantity: maxBuyQuantity,
        });

        orderCondition(finalQuantity) && operations.push(getLimitBuyParams({
          symbol: bookBot.symbol,
          price: BigNumber(previousBuyPrice).plus(getPrecisionPrice(tokenPrecision)),
          quantity: finalQuantity,
        }));
      }
    }
    const currentQuantity = _.get(buyBook, '[0].quantity', '0');
    const halfOfQuantity = getQuantityToBuy({
      price: buyPrice,
      total: BigNumber(swapBalance).times(bookBot.percentSwap).dividedBy(2).toFixed(),
      precision: tokenPrecision,
    });
    const conditionForRechargeBalance = BigNumber(currentQuantity).lt(halfOfQuantity);
    if (!conditionToCancelOrder && conditionForRechargeBalance) {
      operations.push(getCancelParams({
        id: _.get(buyBook, '[0].txId'),
        type: MARKET_CONTRACT.BUY,
      }));
      if (createBuyOrderCondition) {
        const ourQuantityToBuy = getQuantityToBuy({
          price: buyPrice,
          total: BigNumber(swapBalance).times(bookBot.percentSwap).toFixed(),
          precision: tokenPrecision,
        });

        const finalQuantity = orderQuantity({
          ourQuantity: ourQuantityToBuy, maxQuantity: maxBuyQuantity,
        });

        orderCondition(finalQuantity) && operations.push(getLimitBuyParams({
          symbol: bookBot.symbol,
          price: buyPrice,
          quantity: finalQuantity,
        }));
      }
    }
  }

  if (!sellPriceIsMine && createSellOrderCondition) {
    const previousOrder = _.find(sellBook, (order) => order.account === bookBot.account);
    if (previousOrder) {
      operations.push(getCancelParams({
        id: _.get(previousOrder, 'txId'),
        type: MARKET_CONTRACT.SELL,
      }));
    }
    const ourQuantityToSell = BigNumber(symbolBalance)
      .times(bookBot.percentSymbol).toFixed(tokenPrecision);

    const finalQuantity = orderQuantity({
      ourQuantity: ourQuantityToSell, maxQuantity: maxSellQuantity,
    });

    orderCondition(finalQuantity) && operations.push(getLimitSellParams({
      symbol: bookBot.symbol,
      price: nextSellPrice,
      quantity: finalQuantity,
    }));
  }

  if (sellPriceIsMine) {
    const previousSellPrice = _.get(sellBook, '[1].price', '0');
    const conditionToCancelOrder = BigNumber(previousSellPrice).minus(sellPrice)
      .gt(getPrecisionPrice(tokenPrecision));

    if (conditionToCancelOrder) {
      operations.push(getCancelParams({
        id: _.get(sellBook, '[0].txId'),
        type: MARKET_CONTRACT.SELL,
      }));
      if (createSellOrderCondition) {
        const ourQuantityToSell = BigNumber(symbolBalance)
          .times(bookBot.percentSymbol).toFixed(tokenPrecision);

        const finalQuantity = orderQuantity({
          ourQuantity: ourQuantityToSell, maxQuantity: maxSellQuantity,
        });

        orderCondition(finalQuantity) && operations.push(getLimitSellParams({
          symbol: bookBot.symbol,
          price: BigNumber(previousSellPrice).minus(getPrecisionPrice(tokenPrecision)),
          quantity: finalQuantity,
        }));
      }
    }
    const currentQuantity = _.get(sellBook, '[0].quantity', '0');
    const halfOfQuantity = BigNumber(symbolBalance).times(bookBot.percentSymbol)
      .dividedBy(2).toFixed(tokenPrecision);

    const conditionForRechargeBalance = BigNumber(currentQuantity).lt(halfOfQuantity);
    if (!conditionToCancelOrder && conditionForRechargeBalance) {
      operations.push(getCancelParams({
        id: _.get(sellBook, '[0].txId'),
        type: MARKET_CONTRACT.SELL,
      }));
      if (createSellOrderCondition) {
        const ourQuantityToSell = BigNumber(symbolBalance)
          .times(bookBot.percentSymbol).toFixed(tokenPrecision);

        const finalQuantity = orderQuantity({
          ourQuantity: ourQuantityToSell, maxQuantity: maxSellQuantity,
        });

        orderCondition(finalQuantity) && operations.push(getLimitSellParams({
          symbol: bookBot.symbol,
          price: sellPrice,
          quantity: finalQuantity,
        }));
      }
    }
  }
  if (_.isEmpty(operations)) return;
  const cancelTransactions = handleOpenOrders({
    operations, bookBot, buyBook, sellBook,
  });
  operations.unshift(...cancelTransactions);

  return bookBroadcastToChain({ bookBot, operations });
};

const bookBroadcastToChain = async ({ bookBot, operations }) => {
  const { result } = await broadcastUtil.broadcastJson({
    json: JSON.stringify(operations),
    required_auths: [bookBot.account],
    key: bookBot.key,
  });
  console.log(result);
};

const handleDeal = async ({
  bookBot, dieselPool, tradeFeeMul, event,
}) => {
  // const eventPrice = BigNumber(event.quantityHive).dividedBy(event.quantityTokens).toFixed();
  // block 14852808
  const swapOutput = poolSwapHelper.getSwapOutput(getSwapParams({
    event, bookBot, dieselPool, tradeFeeMul,
  }));
  // need transfer to bank
  // const profit = BigNumber(event.quantityTokens).minus(swapOutput.amountOut).toFixed();
  return bookBroadcastToChain({ bookBot, operations: swapOutput.json });
  // if buy quantityTokens swap на hive (spent hive)
  // if sell quantityHive swap на tokens (spent token)
};

const handleMarketSell = async ({
  symbolBalance, tokenPrecision, maxSellQuantity, buyBook, bookBot,
}) => {
  const redisSellKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.MARKET_SELL}:${bookBot.symbol}:${bookBot.account}`;
  const previousOrder = await redisGetter.getAsync({ key: redisSellKey });
  const ourQuantityToSell = BigNumber(symbolBalance)
    .times(bookBot.percentSymbol).toFixed(tokenPrecision);

  const finalQuantity = orderQuantity({
    ourQuantity: ourQuantityToSell, maxQuantity: maxSellQuantity,
  });

  const topBookQuantity = _.get(buyBook, '[0].quantity', '0');
  const sellAll = BigNumber(finalQuantity).gt(topBookQuantity);
  if (orderCondition(finalQuantity) && !previousOrder) {
    const operations = getMarketSellParams({
      symbol: bookBot.symbol,
      quantity: sellAll ? topBookQuantity : finalQuantity,
    });
    await redisSetter.setExpireTTL({
      key: redisSellKey,
      data: bookBot.account,
      expire: REDIS_BOOK.EXPIRE_SECONDS,
    });
    return bookBroadcastToChain({ bookBot, operations });
  }
};

const handleMarketBuy = async ({
  sellPrice, swapBalance, tokenPrecision, bookBot, maxBuyQuantity, sellBook,
}) => {
  const redisBuyKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.MARKET_BUY}:${bookBot.symbol}:${bookBot.account}`;
  const previousOrder = await redisGetter.getAsync({ key: redisBuyKey });

  const ourQuantityToBuy = getQuantityToBuy({
    price: sellPrice,
    total: BigNumber(swapBalance).times(bookBot.percentSwap).toFixed(),
    precision: tokenPrecision,
  });

  const finalQuantity = orderQuantity({
    ourQuantity: ourQuantityToBuy, maxQuantity: maxBuyQuantity,
  });

  const topBookQuantity = _.get(sellBook, '[0].quantity', '0');
  const topBookPrice = _.get(sellBook, '[0].price', '0');
  const hiveQuantity = BigNumber(topBookQuantity).times(topBookPrice).toFixed(tokenPrecision);

  const buyAll = BigNumber(finalQuantity).gt(hiveQuantity);
  const conditionToOrder = orderCondition(finalQuantity) && orderCondition(hiveQuantity);
  if (!conditionToOrder || previousOrder) return;

  const operations = getMarketBuyParams({
    symbol: bookBot.symbol,
    quantity: buyAll ? hiveQuantity : finalQuantity,
  });
  await redisSetter.setExpireTTL({
    key: redisBuyKey,
    data: bookBot.account,
    expire: REDIS_BOOK.EXPIRE_SECONDS,
  });
  return bookBroadcastToChain({ bookBot, operations });
};

const handleBotRc = ({
  rcLeft, bookBot, buyBook, sellBook,
}) => {
  const buyPosition = _.findIndex(buyBook, (order) => order.account === bookBot.account);
  const sellPosition = _.findIndex(sellBook, (order) => order.account === bookBot.account);

  const secondPositionCondition = BigNumber(buyPosition).lte(1) && BigNumber(sellPosition).lte(1);
  const thirdPositionCondition = BigNumber(buyPosition).lte(2) && BigNumber(sellPosition).lte(2);
  const fourthPositionCondition = BigNumber(buyPosition).lte(3) && BigNumber(sellPosition).lte(3);

  if (BigNumber(rcLeft).lt(10)) {
    return { exit: fourthPositionCondition };
  }
  if (BigNumber(rcLeft).lt(20)) {
    bookEmitter.emit(BOOK_EMITTER_EVENTS.RC, { account: bookBot.account, rc: rcLeft });
    return { exit: thirdPositionCondition };
  }
  if (BigNumber(rcLeft).lt(30)) {
    return { exit: thirdPositionCondition };
  }
  if (BigNumber(rcLeft).lt(50)) {
    return { exit: secondPositionCondition };
  }
  return { exit: false };
};

(async () => {
  // validate params to buy to sell percent
  const bookBot = {
    account: 'pi-trader',
    key: 'vbbv',
    symbol: 'WAIV',
    bookStages: {
      first: {
        percentToSell: 0.1,
        percentToBuy: 0.1,
        positionBuy: 0,
        positionSell: 0,
      },
      second: {
        percentToSell: 0.3,
        percentToBuy: 0.3,
        positionBuy: 0.3,
        positionSell: 0.3,
      },
      third: {
        percentToSell: 0.6,
        percentToBuy: 0.6,
        positionBuy: 0.6,
        positionSell: 0.6,
      },
    },
  };

  await handleBookEvent({ bookBot });

  console.log();
})();
