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
const { expiredPostsClient } = require('utilities/redis/redis');
const poolSwapHelper = require('./poolSwapHelper');
const bookEmitter = require('./bookEvents');
const {
  getQuantityToBuy,
  getFormattedBalance,
  getDieselPoolPrice,
  getLimitBuyParams,
  getLimitSellParams,
  getMarketBuyParams,
  getMarketSellParams,
  getCancelParams,
  orderQuantity,
  orderCondition,
  getSwapParams,
  countTotalBalance,
  validateBookBot,
} = require('./bookHelpers');

exports.sendBookEvent = async ({ symbol, event }) => {
  const bookBot = _.find(BOOK_BOTS, (bot) => bot.symbol === symbol);
  if (!bookBot) return;
  if (!validateBookBot(bookBot)) return console.error(`Invalid ${bookBot.account} bot params`);
  await handleBookEvent({ bookBot: _.cloneDeep(bookBot), event });
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

  const poolPrice = getDieselPoolPrice({ dieselPool, bookBot });
  const poolPriceFee = BigNumber(poolPrice).times(BigNumber(1).minus(tradeFeeMul)).toFixed();
  const buyPrice = _.get(buyBook, '[0].price', '0');
  const sellPrice = _.get(sellBook, '[0].price', '0');

  const marketBuyCondition = BigNumber(sellPrice).lt(poolPrice)
    && !BigNumber(sellPrice).eq(0);

  const marketSellCondition = BigNumber(buyPrice).gt(poolPrice)
    && !BigNumber(buyPrice).eq(0);

  if (rcLeft && !event) handleBotRc({ rcLeft, bookBot });

  if (event) {
    return handleDeal({
      bookBot, dieselPool, event, tradeFeeMul,
    });
  }

  if (marketSellCondition) {
    const maxSellQuantity = poolSwapHelper.maxQuantityBookOrder({
      pool: dieselPool,
      type: MARKET_CONTRACT.SELL,
      price: sellPrice,
      tradeFeeMul,
    });
    return handleMarketSell({
      symbolBalance, tokenPrecision, bookBot, buyBook, maxSellQuantity,
    });
  }

  if (marketBuyCondition) {
    const maxBuyQuantity = poolSwapHelper.maxQuantityBookOrder({
      pool: dieselPool,
      type: MARKET_CONTRACT.BUY,
      price: buyPrice,
      tradeFeeMul,
    });
    return handleMarketBuy({
      sellPrice, swapBalance, tokenPrecision, bookBot, maxBuyQuantity, sellBook,
    });
  }

  for (const position in bookBot.positions) {
    const limitBuyOrders = await handleLimitBuy({
      position,
      totalBalance: swapTotalBalance,
      book: buyBook,
      bookBot,
      poolPrice,
      poolPriceFee,
      tradeFeeMul,
      dieselPool,
      tokenPrecision,
    });
    const limitSellOrders = await handleLimitSell({
      totalBalance: symbolTotalBalance,
      position,
      book: sellBook,
      bookBot,
      poolPrice,
      poolPriceFee,
      tradeFeeMul,
      dieselPool,
      tokenPrecision,
    });

    operations.push(...limitBuyOrders, ...limitSellOrders);
  }

  if (_.isEmpty(operations)) return;
  operations.sort((a, b) => (b.contractAction === MARKET_CONTRACT.CANCEL) - (a.contractAction === MARKET_CONTRACT.CANCEL));

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

const handleLimitSell = async ({
  totalBalance,
  book,
  position,
  bookBot,
  poolPrice,
  poolPriceFee,
  dieselPool,
  tradeFeeMul,
  tokenPrecision,
}) => {
  let needRenewOrder = false;
  const operations = [];
  const { positions } = bookBot;
  const { positionSell } = positions[position];
  const { percentToSellSymbol } = positions[position];

  const minPrice = _.get(book, '[0].price', '10000');

  const redisKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.SELL}:${bookBot.symbol}:${bookBot.account}:${position}`;
  const previousOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);

  const positionPrice = calcPriceToSell({
    positionSell,
    poolPrice,
    minPrice,
    poolPriceFee,
  });

  if (previousOrder) {
    const orderInBook = _.find(book,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(previousOrder.price));
    if (!orderInBook) {
      await redisSetter.delKey(redisKey);
      return [];
    }
    const { needUpdateQuantity, needUpdatePrice } = getUpdateOrderConditions({
      bookBot, previousOrder, positionPrice, orderInBook,
    });
    if (needUpdateQuantity || needUpdatePrice) {
      operations.push(getCancelParams({
        id: _.get(previousOrder, 'txId'),
        type: MARKET_CONTRACT.SELL,
      }));
      await redisSetter.delKey(redisKey);
      needRenewOrder = true;
    }
  }

  const maxSellQuantity = poolSwapHelper.maxQuantityBookOrder({
    pool: dieselPool,
    type: MARKET_CONTRACT.SELL,
    price: positionPrice,
    tradeFeeMul,
  });

  const ourQuantityToSell = BigNumber(totalBalance)
    .times(percentToSellSymbol).toFixed(tokenPrecision);

  const finalQuantity = orderQuantity({
    ourQuantity: ourQuantityToSell, maxQuantity: maxSellQuantity,
  });
  const newOrderCondition = orderCondition(finalQuantity) && (!previousOrder || needRenewOrder);
  if (newOrderCondition) {
    operations.push(getLimitSellParams({
      symbol: bookBot.symbol,
      price: positionPrice,
      quantity: finalQuantity,
    }));
    await redisSetter.hmsetAsync(
      redisKey,
      {
        price: positionPrice,
        quantity: finalQuantity,
      },
      expiredPostsClient,
    );
  }
  return operations;
};

const calcPriceToSell = ({
  positionSell,
  poolPrice,
  minPrice,
  poolPriceFee,
}) => {
  const startPrice = BigNumber(poolPrice).lt(BigNumber(minPrice).minus(poolPriceFee))
    ? minPrice
    : BigNumber(poolPrice).plus(poolPriceFee).toFixed();
  const addPart = BigNumber(startPrice).times(positionSell).toFixed();

  return BigNumber(startPrice).plus(addPart).toFixed(HIVE_PEGGED_PRECISION);
};

const handleLimitBuy = async ({
  totalBalance,
  book,
  position,
  bookBot,
  poolPrice,
  poolPriceFee,
  dieselPool,
  tradeFeeMul,
  tokenPrecision,
}) => {
  let needRenewOrder = false;
  const operations = [];
  const { positions } = bookBot;
  const { positionBuy } = positions[position];
  const { percentToBuySwap } = positions[position];

  const maxPrice = _.get(book, '[0].price', '0.001');

  const redisKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.BUY}:${bookBot.symbol}:${bookBot.account}:${position}`;
  const previousOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);

  const positionPrice = calcPriceToBuy({
    positionBuy,
    poolPrice,
    maxPrice,
    poolPriceFee,
  });

  if (previousOrder) {
    const orderInBook = _.find(book,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(previousOrder.price));
    if (!orderInBook) {
      await redisSetter.delKey(redisKey);
      return [];
    }
    const { needUpdateQuantity, needUpdatePrice } = getUpdateOrderConditions({
      bookBot, previousOrder, positionPrice, orderInBook,
    });
    if (needUpdateQuantity || needUpdatePrice) {
      operations.push(getCancelParams({
        id: _.get(previousOrder, 'txId'),
        type: MARKET_CONTRACT.BUY,
      }));
      await redisSetter.delKey(redisKey);
      needRenewOrder = true;
    }
  }

  const maxBuyQuantity = poolSwapHelper.maxQuantityBookOrder({
    pool: dieselPool,
    type: MARKET_CONTRACT.BUY,
    price: positionPrice,
    tradeFeeMul,
  });

  const ourQuantityToBuy = getQuantityToBuy({
    price: positionPrice,
    total: BigNumber(totalBalance).times(percentToBuySwap).toFixed(HIVE_PEGGED_PRECISION),
    precision: tokenPrecision,
  });

  const finalQuantity = orderQuantity({
    ourQuantity: ourQuantityToBuy, maxQuantity: maxBuyQuantity,
  });

  const newOrderCondition = orderCondition(finalQuantity) && (!previousOrder || needRenewOrder);
  if (newOrderCondition) {
    operations.push(getLimitBuyParams({
      symbol: bookBot.symbol,
      price: positionPrice,
      quantity: finalQuantity,
    }));
    await redisSetter.hmsetAsync(
      redisKey,
      {
        price: positionPrice,
        quantity: finalQuantity,
      },
      expiredPostsClient,
    );
  }

  return operations;
};

const calcPriceToBuy = ({
  positionBuy, maxPrice, poolPrice, poolPriceFee,
}) => {
  const startPrice = BigNumber(BigNumber(maxPrice).plus(poolPriceFee)).lt(poolPrice)
    ? maxPrice
    : BigNumber(poolPrice).minus(poolPriceFee);
  const subtractPart = BigNumber(startPrice).times(positionBuy).toFixed();

  return BigNumber(startPrice).minus(subtractPart).toFixed(HIVE_PEGGED_PRECISION);
};

const getUpdateOrderConditions = ({
  previousOrder, positionPrice, bookBot, orderInBook,
}) => {
  const percentQuantityLeft = BigNumber(orderInBook.quantity)
    .times(100)
    .dividedBy(previousOrder.quantity);
  const changePricePercent = BigNumber(positionPrice)
    .minus(orderInBook.price).abs()
    .dividedBy(orderInBook.price)
    .times(100);

  const needUpdateQuantity = BigNumber(percentQuantityLeft).lt(bookBot.updateQuantityPercent);
  const needUpdatePrice = BigNumber(changePricePercent).gt(bookBot.priceDiffPercent);

  return { needUpdateQuantity, needUpdatePrice };
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
  const ourQuantityToSell = BigNumber(symbolBalance).toFixed(tokenPrecision);

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
    total: BigNumber(swapBalance).toFixed(),
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

const handleBotRc = ({ rcLeft, bookBot }) => {
  if (BigNumber(rcLeft).lt(10)) {
    bookBot.priceDiffPercent = 2;
  }
  if (BigNumber(rcLeft).lt(20)) {
    bookEmitter.emit(BOOK_EMITTER_EVENTS.RC, { account: bookBot.account, rc: rcLeft });
    bookBot.priceDiffPercent = 1.75;
  }
  if (BigNumber(rcLeft).lt(30)) {
    bookBot.priceDiffPercent = 1.5;
  }
  if (BigNumber(rcLeft).lt(50)) {
    bookBot.priceDiffPercent = 1.25;
  }
};
