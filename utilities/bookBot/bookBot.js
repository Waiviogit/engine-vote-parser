const {
  BOOK_BOTS, POOL_FEE, REDIS_BOOK, HIVE_PEGGED_PRECISION, START_POSITION,
} = require('constants/bookBot');
const engineMarket = require('utilities/hiveEngine/market');
const enginePool = require('utilities/hiveEngine/marketPools');
const tokensContract = require('utilities/hiveEngine/tokensContract');
const BigNumber = require('bignumber.js');
const _ = require('lodash');
const { MARKET_CONTRACT } = require('constants/hiveEngine');
const redisGetter = require('utilities/redis/redisGetter');
const redisSetter = require('utilities/redis/redisSetter');
const { expiredPostsClient } = require('utilities/redis/redis');
const poolSwapHelper = require('./helpers/poolSwapHelper');
const {
  getQuantityToBuy,
  getFormattedBalance,
  getDieselPoolPrice,
  getLimitBuyParams,
  getLimitSellParams,
  getCancelParams,
  orderCondition,
  countTotalBalance,
  validateBookBot,
  getSwapExpenses,
} = require('./helpers/bookHelpers');
const { closeNoFundOrExpiringOrders } = require('./helpers/closeNoFundExpiringOrdersHelper');
const { bookBroadcastToChain } = require('./helpers/bookBroadcastToChainHelper');
const { LOWER_BOUND_PROFIT_PERCENT } = require('../../constants/bookBot');

exports.sendBookEvent = async ({ symbol, events }) => {
  const bookBot = _.find(BOOK_BOTS, (bot) => bot.symbol === symbol);
  if (!bookBot) return;
  if (!validateBookBot(bookBot)) return console.error(`Invalid ${bookBot.account} bot params`);
  await handleBookEvent({ bookBot: _.cloneDeep(bookBot), events });
};

const handleBookEvent = async ({ bookBot, events }) => {
  const operations = [];

  const requests = await Promise.all([
    tokensContract.getTokenBalances({
      query: { symbol: { $in: ['SWAP.HIVE', bookBot.symbol] }, account: bookBot.account },
    }),
    tokensContract.getTokensParams({ query: { symbol: bookBot.symbol } }),
    engineMarket.getBuyBook({ query: { symbol: bookBot.symbol } }),
    engineMarket.getSellBook({ query: { symbol: bookBot.symbol } }),
    enginePool.getMarketPools({ query: { tokenPair: bookBot.tokenPair } }),
    enginePool.getMarketPoolsParams(),
  ]);
  const [balances, token, buyBook, sellBook, marketPools, params] = requests;

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

  const { poolQuantity } = getDieselPoolPrice({ dieselPool, bookBot });

  if (events) {
    return handleDeal({
      bookBot, dieselPool, events, tradeFeeMul, tokenPrecision,
    });
  }

  /**
   * Handle Limit Buy Limit Sell
   */
  const balanceLimitBuy = BigNumber(swapTotalBalance)
    .times(bookBot.swapBalanceUsage)
    .minus(BigNumber(swapTotalBalance).times(bookBot.untouchedSwapPercent))
    .toFixed(HIVE_PEGGED_PRECISION);

  const balanceLimitSell = BigNumber(symbolTotalBalance)
    .times(bookBot.symbolBalanceUsage)
    .minus(BigNumber(symbolTotalBalance).times(bookBot.untouchedSymbolPercent))
    .toFixed(tokenPrecision);

  const startLimitBuyQuantity = BigNumber(BigNumber(poolQuantity)
    .multipliedBy(bookBot.startQuantityCoefficient)).dividedBy(bookBot.buyRatio)
    .toFixed(tokenPrecision);
  const startLimitSellQuantity = BigNumber(BigNumber(poolQuantity)
    .multipliedBy(bookBot.startQuantityCoefficient)).dividedBy(bookBot.sellRatio)
    .toFixed(tokenPrecision);

  const lastOrderBuyEXKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.BUY}:${bookBot.symbol}:${bookBot.account}`;
  const lastOrderSellEXKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.SELL}:${bookBot.symbol}:${bookBot.account}`;
  const handleLimitBuyParams = {
    profitPercent: bookBot.profitPercent,
    lastOrderEXKey: lastOrderBuyEXKey,
    quantity: startLimitBuyQuantity,
    balance: balanceLimitBuy,
    position: START_POSITION,
    tokenPrecision,
    book: buyBook,
    operations: [],
    tradeFeeMul,
    dieselPool,
    bookBot,
  };
  const handleLimitSellParams = {
    profitPercent: bookBot.profitPercent,
    lastOrderEXKey: lastOrderSellEXKey,
    quantity: startLimitSellQuantity,
    balance: balanceLimitSell,
    position: START_POSITION,
    operations: [],
    tokenPrecision,
    book: sellBook,
    tradeFeeMul,
    dieselPool,
    bookBot,
  };

  const limitOrders = await Promise.all([
    handleLimitBuy(handleLimitBuyParams),
    handleLimitSell(handleLimitSellParams),
  ]);
  const [
    { limitBuyOperations, limitBuyCounter },
    { limitSellOperations, limitSellCounter },
  ] = limitOrders;

  if (limitBuyOperations.length) {
    await redisSetter.setExpireTTL({
      expire: REDIS_BOOK.EXPIRE_SECONDS,
      key: lastOrderBuyEXKey,
      data: bookBot.account,
    });
  }
  if (limitSellOperations.length) {
    await redisSetter.setExpireTTL({
      expire: REDIS_BOOK.EXPIRE_SECONDS,
      key: lastOrderSellEXKey,
      data: bookBot.account,
    });
  }
  operations.push(...limitSellOperations, ...limitBuyOperations);
  /**
   * Close orders if liquidity removed and we have have  different positions
   */
  const noFundLimitBuy = await closeNoFundOrExpiringOrders({
    positions: makePositionsArray(limitBuyCounter),
    type: MARKET_CONTRACT.BUY,
    book: buyBook,
    bookBot,
  });

  const noFundLimitSell = await closeNoFundOrExpiringOrders({
    positions: makePositionsArray(limitSellCounter),
    type: MARKET_CONTRACT.SELL,
    book: sellBook,
    operations,
    bookBot,
  });

  operations.push(...noFundLimitBuy, ...noFundLimitSell);
  if (_.isEmpty(operations)) return;
  /**
   * Close orders always goes first
   */

  operations.sort((a, b) => (b.contractAction === MARKET_CONTRACT.CANCEL) - (a.contractAction === MARKET_CONTRACT.CANCEL));

  return bookBroadcastToChain({ bookBot, operations });
};

const isNeedToUpdateQuantity = ({
  previousOrderQuantity, updateQuantityPercent, bookQuantity = 0,
}) => {
  const percentQuantityLeft = BigNumber(bookQuantity)
    .times(100)
    .dividedBy(previousOrderQuantity);
  return BigNumber(percentQuantityLeft).lt(updateQuantityPercent);
};

const isNeedToUpdatePrice = ({
  currentPrice, priceDiffPercent, previousPrice, type, lowerBoundPrice,
}) => {
  const priceDiff = BigNumber(previousPrice).minus(lowerBoundPrice).toFixed();
  const immediatelyUpdate = type === MARKET_CONTRACT.BUY
    ? BigNumber(priceDiff).gt(0)
    : BigNumber(priceDiff).lt(0);

  if (immediatelyUpdate) return true;

  const changePricePercent = getChangePricePercent({ currentPrice, previousPrice });

  return BigNumber(changePricePercent).gt(priceDiffPercent);
};

const getChangePricePercent = ({ currentPrice, previousPrice }) => BigNumber(currentPrice)
  .minus(previousPrice).abs()
  .dividedBy(previousPrice)
  .times(100)
  .toFixed();

const handleDeal = async ({
  bookBot, dieselPool, tradeFeeMul, events, tokenPrecision,
}) => {
  const operations = _.reduce(events, (accum, event) => {
    const swapOutput = poolSwapHelper.getSwapOutput(poolSwapHelper.getSwapParams({
      event, bookBot, dieselPool, tradeFeeMul, tokenPrecision,
    }));
    accum.push(swapOutput.json);
    return accum;
  }, []);
  // const eventPrice = BigNumber(event.quantityHive).dividedBy(event.quantityTokens).toFixed();
  // block 14852808
  // need transfer to bank
  // const profit = BigNumber(event.quantityTokens).minus(swapOutput.amountOut).toFixed();
  return bookBroadcastToChain({ bookBot, operations });
  // if buy quantityTokens swap на hive (spent hive)
  // if sell quantityHive swap на tokens (spent token)
};

const handleLimitBuy = async ({
  tokenPrecision,
  lastOrderEXKey,
  profitPercent,
  tradeFeeMul,
  operations,
  dieselPool,
  quantity,
  position,
  bookBot,
  balance,
  book,
}) => {
  if (BigNumber(balance).eq(0)) {
    return { limitBuyOperations: operations, limitBuyCounter: position };
  }
  let needRenewOrder = false;
  const redisKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.BUY}:${bookBot.symbol}:${bookBot.account}:position${position}`;
  const redisPositions = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.BUY}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;

  const previousOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);
  const lastOrder = await redisGetter.getAsync({ key: lastOrderEXKey });

  let currentQuantity = BigNumber(quantity).times(bookBot.buyRatio).toFixed(tokenPrecision);
  const previousOrders = await previousOrdersQuantity({
    bookBot, position, type: MARKET_CONTRACT.BUY, tokenPrecision,
  });

  const pricesAndPreviousOrders = [];
  getProfitPriceWithPreviousOrders({
    currentQuantity,
    type: MARKET_CONTRACT.BUY,
    pool: dieselPool,
    tokenPrecision,
    profitPercent,
    tradeFeeMul,
    bookBot,
    book,
    previousBotOrders: previousOrders,
    pricesAndPreviousOrders,
  });
  /** Getting the last object out of array because of the recursion return */
  const { price, actualPreviousOrders } = pricesAndPreviousOrders[pricesAndPreviousOrders.length - 1];

  if (BigNumber(price).eq('0')) {
    return { limitBuyOperations: operations, limitBuyCounter: position };
  }

  const expenses = getSwapExpenses({ quantity: currentQuantity, price });

  let newBalance = BigNumber(balance).minus(expenses).toFixed();
  const outOfBalance = BigNumber(newBalance).lte(0);
  if (outOfBalance) {
    currentQuantity = getQuantityToBuy({
      total: BigNumber(balance).toFixed(),
      precision: tokenPrecision,
      price,
    });
    newBalance = 0;
  }

  if (previousOrder) {
    const orderInBook = _.find(book,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(previousOrder.price));
    if (!orderInBook && !lastOrder) {
      await redisSetter.delKey(redisKey);
      await redisSetter.srem(redisPositions, `position${position}`);
      return handleLimitBuy({
        operations, bookBot, quantity, balance, tokenPrecision, tradeFeeMul, dieselPool, position, book, profitPercent, lastOrderEXKey,
      });
    }

    const lowerBoundPrice = calcProfitPrice({
      quantity: BigNumber(currentQuantity).plus(actualPreviousOrders).toFixed(tokenPrecision),
      type: MARKET_CONTRACT.BUY,
      pool: dieselPool,
      tokenPrecision,
      profitPercent: BigNumber(profitPercent).multipliedBy(LOWER_BOUND_PROFIT_PERCENT).toFixed(),
      tradeFeeMul,
      bookBot,
    });

    const needUpdatePrice = isNeedToUpdatePrice({
      priceDiffPercent: bookBot.priceDiffPercent,
      previousPrice: previousOrder.price,
      type: MARKET_CONTRACT.BUY,
      currentPrice: price,
      lowerBoundPrice,
    });

    const needUpdateQuantity = isNeedToUpdateQuantity({
      updateQuantityPercent: bookBot.updateQuantityPercent,
      bookQuantity: _.get(orderInBook, 'quantity'),
      previousOrderQuantity: previousOrder.quantity,
    });

    const cancelCondition = !lastOrder && (needUpdateQuantity || needUpdatePrice);
    if (cancelCondition) {
      operations.push(getCancelParams({
        id: _.get(orderInBook, 'txId'),
        type: MARKET_CONTRACT.BUY,
      }));
      await redisSetter.delKey(redisKey);
      await redisSetter.srem(redisPositions, `position${position}`);
      needRenewOrder = true;
    }
  }

  const newOrderCondition = orderCondition(currentQuantity)
      && (!previousOrder || needRenewOrder)
      && !lastOrder;

  if (newOrderCondition) {
    operations.push(getLimitBuyParams({
      quantity: BigNumber(currentQuantity).toFixed(tokenPrecision),
      symbol: bookBot.symbol,
      price,
    }));
    await redisSetter.hmsetAsync(
      redisKey,
      { price, quantity: BigNumber(currentQuantity).toFixed(tokenPrecision) },
      expiredPostsClient,
    );
    await redisSetter.sadd(redisPositions, `position${position}`);
  }
  return handleLimitBuy({
    profitPercent: BigNumber(profitPercent).plus(bookBot.profitUpdateStep).toNumber(),
    quantity: currentQuantity,
    position: ++position,
    balance: newBalance,
    tokenPrecision,
    lastOrderEXKey,
    tradeFeeMul,
    dieselPool,
    operations,
    bookBot,
    book,
  });
};

const handleLimitSell = async ({
  tokenPrecision,
  lastOrderEXKey,
  profitPercent,
  tradeFeeMul,
  operations,
  dieselPool,
  quantity,
  position,
  bookBot,
  balance,
  book,
}) => {
  if (BigNumber(balance).eq(0)) {
    return { limitSellOperations: operations, limitSellCounter: position };
  }
  let needRenewOrder = false;
  let currentQuantity = BigNumber(quantity).times(bookBot.sellRatio).toFixed(tokenPrecision);

  const redisKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.SELL}:${bookBot.symbol}:${bookBot.account}:position${position}`;
  const redisPositions = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.SELL}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;

  const previousOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);
  const lastOrder = await redisGetter.getAsync({ key: lastOrderEXKey });

  const previousOrders = await previousOrdersQuantity({
    bookBot, position, type: MARKET_CONTRACT.SELL, tokenPrecision,
  });

  const pricesAndPreviousOrders = [];
  getProfitPriceWithPreviousOrders({
    currentQuantity,
    type: MARKET_CONTRACT.SELL,
    pool: dieselPool,
    tokenPrecision,
    profitPercent,
    tradeFeeMul,
    bookBot,
    book,
    previousBotOrders: previousOrders,
    pricesAndPreviousOrders,
  });
  /** Getting the last object out of array because of the recursion return */
  const { price, actualPreviousOrders } = pricesAndPreviousOrders[pricesAndPreviousOrders.length - 1];

  if (BigNumber(price).eq('0')) {
    return { limitSellOperations: operations, limitSellCounter: position };
  }

  let newBalance = BigNumber(balance).minus(currentQuantity).toFixed();
  const outOfBalance = BigNumber(newBalance).lte(0);
  if (outOfBalance) {
    currentQuantity = balance;
    newBalance = 0;
  }

  if (previousOrder) {
    const orderInBook = _.find(book,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(previousOrder.price));
    if (!orderInBook && !lastOrder) {
      await redisSetter.delKey(redisKey);
      await redisSetter.srem(redisPositions, `position${position}`);
      return handleLimitSell({
        operations, bookBot, quantity, balance, tokenPrecision, tradeFeeMul, dieselPool, position, book, profitPercent, lastOrderEXKey,
      });
    }

    const lowerBoundPrice = calcProfitPrice({
      quantity: BigNumber(currentQuantity).plus(actualPreviousOrders).toFixed(tokenPrecision),
      type: MARKET_CONTRACT.SELL,
      pool: dieselPool,
      tokenPrecision,
      profitPercent: BigNumber(profitPercent).multipliedBy(LOWER_BOUND_PROFIT_PERCENT).toFixed(),
      tradeFeeMul,
      bookBot,
    });

    const needUpdatePrice = isNeedToUpdatePrice({
      priceDiffPercent: bookBot.priceDiffPercent,
      previousPrice: previousOrder.price,
      type: MARKET_CONTRACT.SELL,
      currentPrice: price,
      lowerBoundPrice,
    });

    const needUpdateQuantity = isNeedToUpdateQuantity({
      updateQuantityPercent: bookBot.updateQuantityPercent,
      previousOrderQuantity: previousOrder.quantity,
      bookQuantity: _.get(orderInBook, 'quantity'),
    });

    const cancelCondition = !lastOrder && (needUpdateQuantity || needUpdatePrice);
    if (cancelCondition) {
      operations.push(getCancelParams({
        id: _.get(orderInBook, 'txId'),
        type: MARKET_CONTRACT.SELL,
      }));
      await redisSetter.delKey(redisKey);
      await redisSetter.srem(redisPositions, `position${position}`);
      needRenewOrder = true;
    }
  }
  const newOrderCondition = orderCondition(currentQuantity)
      && (!previousOrder || needRenewOrder)
      && !lastOrder;
  if (newOrderCondition) {
    operations.push(getLimitSellParams({
      quantity: BigNumber(currentQuantity).toFixed(tokenPrecision),
      symbol: bookBot.symbol,
      price,
    }));
    await redisSetter.hmsetAsync(
      redisKey,
      { price, quantity: BigNumber(currentQuantity).toFixed(tokenPrecision) },
      expiredPostsClient,
    );
    await redisSetter.sadd(redisPositions, `position${position}`);
  }
  return handleLimitSell({
    profitPercent: BigNumber(profitPercent).plus(bookBot.profitUpdateStep).toNumber(),
    quantity: currentQuantity,
    position: ++position,
    balance: newBalance,
    tokenPrecision,
    lastOrderEXKey,
    tradeFeeMul,
    operations,
    dieselPool,
    bookBot,
    book,
  });
};

const previousOrdersQuantity = async ({
  type, position, bookBot, tokenPrecision,
}) => {
  let quantity = BigNumber(0);
  if (position === 0) return quantity.toFixed(tokenPrecision);
  for (const elem of makePositionsArray(position)) {
    const redisKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${elem}`;
    const order = await redisGetter.getHashAll(redisKey, expiredPostsClient);
    quantity = quantity.plus(_.get(order, 'quantity', 0));
  }
  return quantity.toFixed(tokenPrecision);
};

const delIrrelevantRedisKeys = async ({ book, type, bookBot }) => {
  const redisPositionsKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  const currentPositions = await redisGetter.smembers(redisPositionsKey);
  const bookOrders = _.filter(book, (order) => order.account === bookBot.account);
  if (currentPositions.length !== bookOrders.length) {
    const existOrders = [];
    for (const position of currentPositions) {
      const redisKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${position}`;
      const redisOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);
      const bookOrder = _.find(book,
        (order) => order.price === redisOrder.price && order.account === bookBot.account);

      if (!bookOrder) {
        await redisSetter.delKey(redisKey);
        await redisSetter.srem(redisPositionsKey, position);
        continue;
      }

      existOrders.push(bookOrder.txId);
    }

    const cancelOrders = _.filter(bookOrders, (order) => !_.includes(existOrders, order.txId));

    if (!_.isEmpty(cancelOrders)) {
      return _.map(cancelOrders, (cancel) => getCancelParams({
        id: _.get(cancel, 'txId'),
        type,
      }));
    }
  }
};

const makePositionsArray = (positions) => {
  const positionsArr = [];
  for (let i = 0; i < positions; i++) {
    positionsArr.push(`position${i}`);
  }
  return positionsArr;
};

const calcProfitPrice = ({
  pool, quantity, type, tradeFeeMul, bookBot, tokenPrecision, profitPercent,
}) => {
  const slippage = 0.005;
  if (type === MARKET_CONTRACT.BUY) {
    const result = poolSwapHelper.getSwapOutput({
      precision: HIVE_PEGGED_PRECISION,
      symbol: bookBot.symbol,
      amountIn: quantity,
      tradeFeeMul,
      from: true,
      slippage,
      pool,
    });
    const hiveQuantity = BigNumber(result.minAmountOut)
      .times(BigNumber(1).minus(profitPercent));
    if (BigNumber(result.priceImpact).gte(90) || result.priceImpact === 'Infinity') return '0';
    const price = BigNumber(hiveQuantity).dividedBy(quantity).toFixed(HIVE_PEGGED_PRECISION);
    return price;
  }

  if (type === MARKET_CONTRACT.SELL) {
    const result = poolSwapHelper.getSwapOutput({
      precision: tokenPrecision,
      symbol: bookBot.symbol,
      amountIn: quantity,
      from: false,
      tradeFeeMul,
      slippage,
      pool,
    });
    if (BigNumber(result.priceImpact).gte(90) || result.priceImpact === 'Infinity') return '0';
    const hiveAmountWithoutSlippage = BigNumber(result.amountOut)
      .times(BigNumber(1).minus(slippage))
      .toFixed(HIVE_PEGGED_PRECISION);
    const hiveQuantity = BigNumber(hiveAmountWithoutSlippage)
      .plus(result.fee)
      .times(BigNumber(1).plus(profitPercent));
    const price = BigNumber(hiveQuantity).dividedBy(quantity).toFixed(HIVE_PEGGED_PRECISION);
    return price;
  }
};

const getProfitPriceWithPreviousOrders = ({
  currentQuantity, type, pool, tokenPrecision, profitPercent, tradeFeeMul, bookBot,
  previousOrders = 0, book, previousBotOrders, pricesAndPreviousOrders,
}) => {
  const price = calcProfitPrice({
    quantity: BigNumber(currentQuantity).plus(previousOrders).toFixed(tokenPrecision),
    type,
    pool,
    tokenPrecision,
    profitPercent,
    tradeFeeMul,
    bookBot,
  });

  const previousOrdersInBook = getActualPreviousOrders({
    type,
    book,
    bookBot,
    price,
    tokenPrecision,
  });

  const actualPreviousOrders = BigNumber(previousBotOrders).plus(previousOrdersInBook)
    .toFixed(tokenPrecision);
  pricesAndPreviousOrders.push({ price, actualPreviousOrders });
  if (BigNumber(actualPreviousOrders).eq(previousOrders)) return;

  getProfitPriceWithPreviousOrders({
    currentQuantity,
    type,
    pool,
    tokenPrecision,
    profitPercent,
    tradeFeeMul,
    bookBot,
    previousOrders: actualPreviousOrders,
    book,
    previousBotOrders,
    pricesAndPreviousOrders,
  });
};

const getActualPreviousOrders = ({
  type, book, bookBot, price, tokenPrecision,
}) => {
  const ordersBeforeInBook = type === MARKET_CONTRACT.BUY
    ? _.filter(book, (order) => order.account !== bookBot.account && order.price > price)
    : _.filter(book, (order) => order.account !== bookBot.account && order.price < price);

  if (!ordersBeforeInBook.length) return '0';

  let quantity = BigNumber(0);
  for (const order of ordersBeforeInBook) {
    quantity = quantity.plus(_.get(order, 'quantity', 0));
  }

  return quantity.toFixed(tokenPrecision);
};
