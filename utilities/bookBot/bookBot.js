const { BOOK_BOTS, POOL_FEE } = require('constants/bookBot');
const engineMarket = require('utilities/hiveEngine/market');
const enginePool = require('utilities/hiveEngine/marketPools');
const tokensContract = require('utilities/hiveEngine/tokensContract');
const broadcastUtil = require('utilities/hiveApi/broadcastUtil');
const BigNumber = require('bignumber.js');
const _ = require('lodash');
const poolSwapHelper = require('./poolSwapHelper');

exports.sendBookEvent = async ({ symbol, event }) => {
  if (process.env.NODE_ENV !== 'production') return;
  const bookBot = _.find(BOOK_BOTS, (bot) => bot.symbol === symbol);
  if (!bookBot) return;
  await handleBookEvent({ bookBot, event });
};

// rc!!!
const handleBookEvent = async ({ bookBot, event }) => {
  const operations = [];

  const balances = await tokensContract.getTokenBalances({
    query: { symbol: { $in: ['SWAP.HIVE', bookBot.symbol] }, account: bookBot.account },
  });
  const swapBalance = getFormattedBalance(balances);
  const symbolBalance = getFormattedBalance(balances, bookBot.symbol);

  const [token = {}] = await tokensContract.getTokensParams({ query: { symbol: bookBot.symbol } });
  const buyBook = await engineMarket.getBuyBook({ query: { symbol: bookBot.symbol } });
  const sellBook = await engineMarket.getSellBook({ query: { symbol: bookBot.symbol } });
  const [dieselPool = {}] = await enginePool
    .getMarketPools({ query: { tokenPair: bookBot.tokenPair } });
  const [params = {}] = await enginePool.getMarketPoolsParams();
  if (_.isEmpty(dieselPool)) return;

  const tokenPrecision = _.get(token, 'precision', 8);

  const buyPrice = _.get(buyBook, '[0].price', '0');
  const sellPrice = _.get(sellBook, '[0].price', '0');
  const poolPrice = getDieselPoolPrice({ dieselPool, bookBot });
  const buyPriceIsMine = _.get(buyBook, '[0].account') === bookBot.account;
  const sellPriceIsMine = _.get(sellBook, '[0].account') === bookBot.account;

  const poolPriceFee = BigNumber(poolPrice).times(
    BigNumber(1).minus(_.get(params, 'tradeFeeMul', POOL_FEE)),
  ).toFixed();

  const nextBuyPrice = BigNumber(buyPrice).plus(getPrecisionPrice(token.precision)).toFixed();
  const nextSellPrice = BigNumber(sellPrice).minus(getPrecisionPrice(token.precision)).toFixed();

  const nextBuyPriceFee = BigNumber(nextBuyPrice).plus(poolPriceFee).toFixed();
  const nextSellPriceFee = BigNumber(nextBuyPrice).minus(poolPriceFee).toFixed();

  const createBuyOrderCondition = BigNumber(nextBuyPriceFee).lt(poolPrice);
  const createSellOrderCondition = BigNumber(nextSellPriceFee).gt(poolPrice);

  if (event) {
    // const eventPrice = BigNumber(event.quantityHive).dividedBy(event.quantityTokens).toFixed();
    // block 14852808
    const swapOutput = poolSwapHelper.getSwapOutput(getSwapParams({
      event, params, bookBot, dieselPool,
    }));
    operations.push(swapOutput.json);
    // need transfer to bank
    // const profit = BigNumber(event.quantityTokens).minus(swapOutput.amountOut).toFixed();
    return broadcastToChain({ bookBot, operations });
    // if buy quantityTokens swap на hive (spent hive)
    // if sell quantityHive swap на tokens (spent token)
  }

  if (BigNumber(buyPrice).gt(poolPrice)) {
    // validate quantity to not affect pool
    const ourQuantityToSell = BigNumber(symbolBalance)
      .times(bookBot.percentSymbol).toFixed(tokenPrecision);
    const topBookQuantity = _.get(buyBook, '[0].quantity', '0');
    const sellAll = BigNumber(ourQuantityToSell).gt(topBookQuantity);
    operations.push(getMarketSellParams({
      symbol: bookBot.symbol,
      quantity: sellAll ? topBookQuantity : ourQuantityToSell,
    }));
  }

  if (BigNumber(sellPrice).lt(poolPrice)) {
    // validate quantity to not affect pool
    const ourQuantityToBuy = getQuantityToBuy({
      price: sellPrice,
      total: BigNumber(swapBalance).times(bookBot.percentSwap).toFixed(),
      precision: tokenPrecision,
    });
    const topBookQuantity = _.get(buyBook, '[0].quantity', '0');
    const buyAll = BigNumber(ourQuantityToBuy).gt(topBookQuantity);

    operations.push(getMarketBuyParams({
      symbol: bookBot.symbol,
      quantity: buyAll ? topBookQuantity : ourQuantityToBuy,
    }));
  }

  if (!buyPriceIsMine && createBuyOrderCondition) {
    const previousOrder = _.find(buyBook, (order) => order.account === bookBot.account);
    if (previousOrder) {
      operations.push(getCancelParams({
        id: _.get(previousOrder, 'txId'),
        type: 'buy',
      }));
    }

    operations.push(getLimitBuyParams({
      symbol: bookBot.symbol,
      price: nextBuyPrice,
      quantity: getQuantityToBuy({
        price: nextBuyPrice,
        total: BigNumber(swapBalance).times(bookBot.percentSwap).toFixed(),
        precision: tokenPrecision,
      }),
    }));
  }
  // before order check pool prices
  if (buyPriceIsMine) {
    const previousBuyPrice = _.get(buyBook, '[1].price', '0');
    const conditionToCancelOrder = BigNumber(buyPrice).minus(previousBuyPrice)
      .gt(getPrecisionPrice(token.precision));

    if (conditionToCancelOrder) {
      operations.push(getCancelParams({
        id: _.get(buyBook, '[0].txId'),
        type: 'buy',
      }));

      if (createBuyOrderCondition) {
        operations.push(getLimitBuyParams({
          symbol: bookBot.symbol,
          price: BigNumber(previousBuyPrice).plus(getPrecisionPrice(token.precision)),
          quantity: getQuantityToBuy({
            price: BigNumber(previousBuyPrice).plus(getPrecisionPrice(token.precision)),
            total: BigNumber(swapBalance).times(bookBot.percentSwap).toFixed(),
            precision: tokenPrecision,
          }),
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
        type: 'buy',
      }));
      if (createBuyOrderCondition) {
        operations.push(getLimitBuyParams({
          symbol: bookBot.symbol,
          price: buyPrice,
          quantity: getQuantityToBuy({
            price: buyPrice,
            total: BigNumber(swapBalance).times(bookBot.percentSwap).toFixed(),
            precision: tokenPrecision,
          }),
        }));
      }
    }
  }

  if (!sellPriceIsMine && createSellOrderCondition) {
    const previousOrder = _.find(sellBook, (order) => order.account === bookBot.account);
    if (previousOrder) {
      operations.push(getCancelParams({
        id: _.get(previousOrder, 'txId'),
        type: 'sell',
      }));
    }

    operations.push(getLimitSellParams({
      symbol: bookBot.symbol,
      price: nextSellPrice,
      quantity: BigNumber(symbolBalance)
        .times(bookBot.percentSymbol).toFixed(tokenPrecision),
    }));
  }
  // before order check pool prices
  if (sellPriceIsMine) {
    const previousSellPrice = _.get(sellBook, '[1].price', '0');
    const conditionToCancelOrder = BigNumber(previousSellPrice).minus(sellPrice)
      .gt(getPrecisionPrice(token.precision));

    if (conditionToCancelOrder) {
      operations.push(getCancelParams({
        id: _.get(sellBook, '[0].txId'),
        type: 'sell',
      }));
      if (createSellOrderCondition) {
        operations.push(getLimitSellParams({
          symbol: bookBot.symbol,
          price: BigNumber(previousSellPrice).minus(getPrecisionPrice(token.precision)),
          quantity: BigNumber(symbolBalance)
            .times(bookBot.percentSymbol).toFixed(tokenPrecision),
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
        type: 'sell',
      }));
      if (createSellOrderCondition) {
        operations.push(getLimitSellParams({
          symbol: bookBot.symbol,
          price: sellPrice,
          quantity: BigNumber(symbolBalance)
            .times(bookBot.percentSymbol).toFixed(tokenPrecision),
        }));
      }
    }
  }
  if (_.isEmpty(operations)) return;
  return broadcastToChain({ bookBot, operations });
};

const broadcastToChain = async ({ bookBot, operations }) => {
  const { result } = await broadcastUtil.broadcastJson({
    json: JSON.stringify(operations),
    required_auths: [bookBot.account],
    key: bookBot.key,
  });
  console.log(result);
};

const getSwapParams = ({
  event, params, bookBot, dieselPool,
}) => {
  const tokenPairArr = bookBot.tokenPair.split(':');
  const slippage = 0.005;
  const tokensToProcess = event.action === 'buy'
    ? event.quantityHive
    : event.quantityTokens;
  const symbol = event.action === 'buy'
    ? _.filter(tokenPairArr, (el) => el !== bookBot.symbol)[0]
    : bookBot.symbol;

  const tradeFeeMul = BigNumber(tokensToProcess).dividedBy(params.tradeFeeMul);
  const slippagePercent = BigNumber(tokensToProcess).times(slippage);

  const amountIn = BigNumber(tradeFeeMul).plus(slippagePercent).toFixed();
  return {
    amountIn,
    symbol,
    slippage,
    params,
    from: false,
    pool: dieselPool,
  };
};

const getDieselPoolPrice = ({ dieselPool, bookBot }) => {
  const [base] = dieselPool.tokenPair.split(':');
  return base === bookBot.symbol
    ? dieselPool.basePrice
    : dieselPool.quotePrice;
};

// limit orders
const getLimitBuyParams = ({ symbol, quantity, price }) => ({
  contractName: 'market',
  contractAction: 'buy',
  contractPayload: { symbol, quantity, price },
});

const getLimitSellParams = ({ symbol, quantity, price }) => ({
  contractName: 'market',
  contractAction: 'sell',
  contractPayload: { symbol, quantity, price },
});

// market orders
const getMarketBuyParams = ({ symbol, quantity }) => ({
  contractName: 'market',
  contractAction: 'marketBuy',
  contractPayload: { symbol, quantity },
});

const getMarketSellParams = ({ symbol, quantity }) => ({
  contractName: 'market',
  contractAction: 'marketSell',
  contractPayload: { symbol, quantity },
});

const getCancelParams = ({ type, id }) => ({
  contractName: 'market',
  contractAction: 'cancel',
  contractPayload: { type, id },
});

const getPrecisionPrice = (precision) => {
  let string = '0.';
  for (let i = 0; i < precision; i++) {
    if (i === precision - 1) {
      string += '1';
      continue;
    }
    string += '0';
  }
  return string;
};

// use when buy because we know quantity we sell in token
const getQuantityToBuy = ({ price, total, precision }) => BigNumber(total).dividedBy(price).toFixed(precision);

const getFormattedBalance = (balances, symbol = 'SWAP.HIVE') => {
  const balanceInfo = _.find(balances, (b) => b.symbol === 'SWAP.HIVE');
  return _.get(balanceInfo, 'balance', '0');
};
