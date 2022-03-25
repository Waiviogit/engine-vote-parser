const {
  BOOK_BOTS, POOL_FEE, BOOK_EMITTER_EVENTS, REDIS_BOOK, HIVE_PEGGED_PRECISION, START_POSITION,
} = require('constants/bookBot');
const engineMarket = require('utilities/hiveEngine/market');
const enginePool = require('utilities/hiveEngine/marketPools');
const tokensContract = require('utilities/hiveEngine/tokensContract');
const BigNumber = require('bignumber.js');
const _ = require('lodash');
const { MARKET_CONTRACT } = require('constants/hiveEngine');
const { calculateRcPercent } = require('utilities/hiveApi/hiveOperations');
const redisGetter = require('utilities/redis/redisGetter');
const redisSetter = require('utilities/redis/redisSetter');
const { expiredPostsClient } = require('utilities/redis/redis');
const poolSwapHelper = require('./helpers/poolSwapHelper');
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

  const { poolPrice, poolQuantity } = getDieselPoolPrice({ dieselPool, bookBot });
  const buyPrice = _.get(buyBook, '[0].price', '0');
  const sellPrice = _.get(sellBook, '[0].price', '0');

  const marketBuyCondition = BigNumber(sellPrice).lt(poolPrice)
    && !BigNumber(sellPrice).eq(0)
    && _.get(sellBook, '[0].account') !== bookBot.account;

  const marketSellCondition = BigNumber(buyPrice).gt(poolPrice)
    && !BigNumber(buyPrice).eq(0)
    && _.get(buyBook, '[0].account') !== bookBot.account;

  if (rcLeft && !events) handleBotRc({ rcLeft, bookBot });

  if (events) {
    return handleDeal({
      bookBot, dieselPool, events, tradeFeeMul, tokenPrecision,
    });
  }

  if (marketSellCondition) {
    const buyQuantity = _.get(buyBook, '[0].quantity', '0');
    const profitablePrice = calcProfitPrice({
      profitPercent: bookBot.profitPercent,
      type: MARKET_CONTRACT.SELL,
      quantity: buyQuantity,
      pool: dieselPool,
      tokenPrecision,
      tradeFeeMul,
      bookBot,
    });
    if (BigNumber(buyPrice).gt(profitablePrice) && !BigNumber(profitablePrice).eq('0')) {
      const marketSell = await handleMarketSell({
        symbolBalance, bookBot, maxSellQuantity: buyQuantity,
      });
      marketSell && operations.push(marketSell);
    }
  }

  if (marketBuyCondition) {
    const sellQuantity = _.get(sellBook, '[0].quantity', '0');
    const profitablePrice = calcProfitPrice({
      profitPercent: bookBot.profitPercent,
      type: MARKET_CONTRACT.BUY,
      quantity: sellQuantity,
      pool: dieselPool,
      tokenPrecision,
      tradeFeeMul,
      bookBot,
    });
    if (BigNumber(sellPrice).lt(profitablePrice) && !BigNumber(profitablePrice).eq('0')) {
      const marketBuy = await handleMarketBuy({
        sellPrice, swapBalance, bookBot, maxBuyQuantity: sellQuantity,
      });
      marketBuy && operations.push(marketBuy);
    }
  }

  /**
   * Close all orders if we find difference between redis and book positions
   */
  const closedLimitBuy = await closeOrdersDifferentFromBot({
    book: buyBook, type: MARKET_CONTRACT.BUY, bookBot,
  });

  const closedLimitSell = await closeOrdersDifferentFromBot({
    book: sellBook, type: MARKET_CONTRACT.SELL, bookBot,
  });
  operations.push(...closedLimitBuy, ...closedLimitSell);

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

  const { limitBuyOperations, limitBuyCounter } = await handleLimitBuy({
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
  });
  const { limitSellOperations, limitSellCounter } = await handleLimitSell({
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
  });
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
  currentPrice, priceDiffPercent, previousPrice, type,
}) => {
  const priceDiff = BigNumber(previousPrice).minus(currentPrice).toFixed();
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

const handleMarketSell = async ({
  symbolBalance, maxSellQuantity, bookBot,
}) => {
  const redisSellKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.MARKET_SELL}:${bookBot.symbol}:${bookBot.account}`;
  const previousOrder = await redisGetter.getAsync({ key: redisSellKey });

  const finalQuantity = orderQuantity({
    ourQuantity: symbolBalance, maxQuantity: maxSellQuantity,
  });

  const conditionToOrder = orderCondition(finalQuantity);
  if (!conditionToOrder || previousOrder) return;

  await redisSetter.setExpireTTL({
    expire: REDIS_BOOK.EXPIRE_SECONDS,
    data: bookBot.account,
    key: redisSellKey,
  });
  return getMarketSellParams({
    symbol: bookBot.symbol,
    quantity: finalQuantity,
  });
};

const handleMarketBuy = async ({
  sellPrice, swapBalance, bookBot, maxBuyQuantity,
}) => {
  const redisBuyKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.MARKET_BUY}:${bookBot.symbol}:${bookBot.account}`;
  const previousOrder = await redisGetter.getAsync({ key: redisBuyKey });

  const maxQuantity = getSwapExpenses({ quantity: maxBuyQuantity, price: sellPrice });

  const finalQuantity = orderQuantity({ ourQuantity: swapBalance, maxQuantity });

  const conditionToOrder = orderCondition(finalQuantity);
  if (!conditionToOrder || previousOrder) return;

  await redisSetter.setExpireTTL({
    expire: REDIS_BOOK.EXPIRE_SECONDS,
    data: bookBot.account,
    key: redisBuyKey,
  });
  return getMarketBuyParams({
    symbol: bookBot.symbol,
    quantity: finalQuantity,
  });
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
  await redisSetter.sadd(redisPositions, `position${position}`);
  const previousOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);

  let currentQuantity = BigNumber(quantity).times(bookBot.buyRatio).toFixed(tokenPrecision);
  const previousOrders = await previousOrdersQuantity({
    bookBot, position, type: MARKET_CONTRACT.BUY, tokenPrecision,
  });

  const price = calcProfitPrice({
    quantity: BigNumber(currentQuantity).plus(previousOrders).toFixed(tokenPrecision),
    type: MARKET_CONTRACT.BUY,
    pool: dieselPool,
    tokenPrecision,
    profitPercent,
    tradeFeeMul,
    bookBot,
  });
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
    const lastOrder = await redisGetter.getAsync({ key: lastOrderEXKey });
    if (!orderInBook && !lastOrder) {
      await redisSetter.delKey(redisKey);
      return handleLimitBuy({
        operations, bookBot, quantity, balance, tokenPrecision, tradeFeeMul, dieselPool, position, book, profitPercent, lastOrderEXKey,
      });
    }

    const lowerBoundPrice = calcProfitPrice({
      quantity: BigNumber(currentQuantity).plus(previousOrders).toFixed(tokenPrecision),
      type: MARKET_CONTRACT.BUY,
      pool: dieselPool,
      tokenPrecision,
      profitPercent: BigNumber(profitPercent).dividedBy(LOWER_BOUND_PROFIT_PERCENT.DIVIDER)
        .toFixed(LOWER_BOUND_PROFIT_PERCENT.PRECISION),
      tradeFeeMul,
      bookBot,
    });

    const needUpdatePrice = isNeedToUpdatePrice({
      priceDiffPercent: bookBot.priceDiffPercent,
      previousPrice: previousOrder.price,
      type: MARKET_CONTRACT.BUY,
      currentPrice: lowerBoundPrice,
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
      needRenewOrder = true;
    }
  }

  const newOrderCondition = orderCondition(currentQuantity) && (!previousOrder || needRenewOrder);
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
  await redisSetter.sadd(redisPositions, `position${position}`);
  const previousOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);

  const previousOrders = await previousOrdersQuantity({
    bookBot, position, type: MARKET_CONTRACT.SELL, tokenPrecision,
  });

  const price = calcProfitPrice({
    quantity: BigNumber(currentQuantity).plus(previousOrders).toFixed(tokenPrecision),
    type: MARKET_CONTRACT.SELL,
    pool: dieselPool,
    tokenPrecision,
    profitPercent,
    tradeFeeMul,
    bookBot,
  });
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
    const lastOrder = await redisGetter.getAsync({ key: lastOrderEXKey });
    if (!orderInBook && !lastOrder) {
      await redisSetter.delKey(redisKey);
      return handleLimitSell({
        operations, bookBot, quantity, balance, tokenPrecision, tradeFeeMul, dieselPool, position, book, profitPercent, lastOrderEXKey,
      });
    }

    const lowerBoundPrice = calcProfitPrice({
      quantity: BigNumber(currentQuantity).plus(previousOrders).toFixed(tokenPrecision),
      type: MARKET_CONTRACT.BUY,
      pool: dieselPool,
      tokenPrecision,
      profitPercent: BigNumber(profitPercent).dividedBy(LOWER_BOUND_PROFIT_PERCENT.DIVIDER)
        .toFixed(LOWER_BOUND_PROFIT_PERCENT.PRECISION),
      tradeFeeMul,
      bookBot,
    });

    const needUpdatePrice = isNeedToUpdatePrice({
      priceDiffPercent: bookBot.priceDiffPercent,
      previousPrice: previousOrder.price,
      type: MARKET_CONTRACT.SELL,
      currentPrice: lowerBoundPrice,
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
      needRenewOrder = true;
    }
  }
  const newOrderCondition = orderCondition(currentQuantity) && (!previousOrder || needRenewOrder);
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

const closeOrdersDifferentFromBot = async ({ book, type, bookBot }) => {
  const operations = [];
  const redisPositions = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  const currentPositions = await redisGetter.smembers(redisPositions);
  const bookOrders = _.filter(book, (order) => order.account === bookBot.account);
  if (currentPositions.length !== bookOrders.length) {
    for (const bookOrder of bookOrders) {
      operations.push(getCancelParams({
        id: _.get(bookOrder, 'txId'),
        type,
      }));
    }
    for (const position of currentPositions) {
      const redisKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${position}`;
      await redisSetter.delKey(redisKey);
    }
    await redisSetter.delKey(redisPositions);
  }
  return operations;
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
