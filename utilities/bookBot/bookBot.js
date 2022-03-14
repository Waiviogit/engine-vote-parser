const {
  BOOK_BOTS, POOL_FEE, BOOK_EMITTER_EVENTS, REDIS_BOOK, HIVE_PEGGED_PRECISION, START_POSITION,
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
  countTotalBalance,
  validateBookBot,
  getSwapExpenses,
} = require('./bookHelpers');

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

  const poolPrice = getDieselPoolPrice({ dieselPool, bookBot });
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
      quantity: buyQuantity,
      type: MARKET_CONTRACT.SELL,
      pool: dieselPool,
      tokenPrecision,
      tradeFeeMul,
      profitPercent: bookBot.profitPercent,
      bookBot,
    });
    if (BigNumber(buyPrice).gt(profitablePrice)) {
      const marketSell = await handleMarketSell({
        symbolBalance, tokenPrecision, bookBot, maxSellQuantity: buyQuantity,
      });
      marketSell && operations.push(marketSell);
    }
  }

  if (marketBuyCondition) {
    const sellQuantity = _.get(sellBook, '[0].quantity', '0');
    const profitablePrice = calcProfitPrice({
      quantity: sellQuantity,
      type: MARKET_CONTRACT.BUY,
      pool: dieselPool,
      tokenPrecision,
      tradeFeeMul,
      profitPercent: bookBot.profitPercent,
      bookBot,
    });
    if (BigNumber(sellPrice).lt(profitablePrice)) {
      const marketBuy = await handleMarketBuy({
        sellPrice, swapBalance, tokenPrecision, bookBot, maxBuyQuantity: sellQuantity,
      });
      marketBuy && operations.push(marketBuy);
    }
  }

  const balanceLimitBuy = BigNumber(swapTotalBalance).times(bookBot.swapBalanceUsage)
    .minus(BigNumber(swapTotalBalance).times(bookBot.untouchedSwapPercent)).toFixed(HIVE_PEGGED_PRECISION);

  const balanceLimitSell = BigNumber(symbolTotalBalance).times(bookBot.symbolBalanceUsage)
    .minus(BigNumber(symbolTotalBalance).times(bookBot.untouchedSymbolPercent)).toFixed(tokenPrecision);

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
  const lastOrderBuyEXKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.BUY}:${bookBot.symbol}:${bookBot.account}`;
  const lastOrderSellEXKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.SELL}:${bookBot.symbol}:${bookBot.account}`;
  const { limitBuyOperations, limitBuyCounter } = await handleLimitBuy({
    operations: [],
    bookBot,
    balance: balanceLimitBuy,
    quantity: BigNumber(bookBot.startBuyQuantity)
      .dividedBy(bookBot.buyRatio).toFixed(tokenPrecision),
    tokenPrecision,
    tradeFeeMul,
    dieselPool,
    book: buyBook,
    position: START_POSITION,
    profitPercent: bookBot.profitPercent,
    lastOrderEXKey: lastOrderBuyEXKey,
  });
  const { limitSellOperations, limitSellCounter } = await handleLimitSell({
    operations: [],
    bookBot,
    balance: balanceLimitSell,
    quantity: BigNumber(bookBot.startSellQuantity)
      .dividedBy(bookBot.sellRatio).toFixed(tokenPrecision),
    tokenPrecision,
    tradeFeeMul,
    dieselPool,
    book: sellBook,
    position: START_POSITION,
    profitPercent: bookBot.profitPercent,
    lastOrderEXKey: lastOrderSellEXKey,
  });
  if (limitBuyOperations.length) {
    await redisSetter.setExpireTTL({
      key: lastOrderBuyEXKey,
      data: bookBot.account,
      expire: REDIS_BOOK.EXPIRE_SECONDS,
    });
  }
  if (limitSellOperations.length) {
    await redisSetter.setExpireTTL({
      key: lastOrderSellEXKey,
      data: bookBot.account,
      expire: REDIS_BOOK.EXPIRE_SECONDS,
    });
  }
  operations.push(...limitSellOperations, ...limitBuyOperations);

  /**
   * Close orders if liquidity removed and we have have  different positions
   */

  const noFundLimitBuy = await closeNoFundOrders({
    positions: makePositionsArray(limitBuyCounter),
    type: MARKET_CONTRACT.BUY,
    book: buyBook,
    bookBot,
  });

  const noFundLimitSell = await closeNoFundOrders({
    positions: makePositionsArray(limitSellCounter),
    type: MARKET_CONTRACT.SELL,
    book: sellBook,
    operations,
    bookBot,
  });

  operations.push(...noFundLimitBuy, ...noFundLimitSell);

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
  let needUpdatePrice = false;
  const priceDiff = BigNumber(previousPrice).minus(currentPrice).toFixed();
  const immediatelyUpdate = type === MARKET_CONTRACT.BUY
    ? BigNumber(priceDiff).gt(0)
    : BigNumber(priceDiff).lt(0);

  if (immediatelyUpdate) {
    needUpdatePrice = true;
  } else {
    const changePricePercent = getChangePricePercent({ currentPrice, previousPrice });
    needUpdatePrice = BigNumber(changePricePercent).gt(priceDiffPercent);
  }
  return needUpdatePrice;
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
  symbolBalance, tokenPrecision, maxSellQuantity, bookBot,
}) => {
  const redisSellKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.MARKET_SELL}:${bookBot.symbol}:${bookBot.account}`;
  const previousOrder = await redisGetter.getAsync({ key: redisSellKey });
  const ourQuantityToSell = BigNumber(symbolBalance).toFixed(tokenPrecision);

  const finalQuantity = orderQuantity({
    ourQuantity: ourQuantityToSell, maxQuantity: maxSellQuantity,
  });

  const conditionToOrder = orderCondition(finalQuantity);
  if (!conditionToOrder || previousOrder) return;

  await redisSetter.setExpireTTL({
    key: redisSellKey,
    data: bookBot.account,
    expire: REDIS_BOOK.EXPIRE_SECONDS,
  });
  return getMarketSellParams({
    symbol: bookBot.symbol,
    quantity: finalQuantity,
  });
};

const handleMarketBuy = async ({
  sellPrice, swapBalance, tokenPrecision, bookBot, maxBuyQuantity,
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

  const conditionToOrder = orderCondition(finalQuantity);
  if (!conditionToOrder || previousOrder) return;

  await redisSetter.setExpireTTL({
    key: redisBuyKey,
    data: bookBot.account,
    expire: REDIS_BOOK.EXPIRE_SECONDS,
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
  operations,
  bookBot,
  quantity,
  balance,
  tokenPrecision,
  tradeFeeMul,
  dieselPool,
  position,
  book,
  profitPercent,
  lastOrderEXKey,
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
    tradeFeeMul,
    bookBot,
    profitPercent,
  });

  const expenses = getSwapExpenses({ quantity: currentQuantity, price });

  let newBalance = BigNumber(balance).minus(expenses).toFixed();
  const outOfBalance = BigNumber(newBalance).lte(0);
  if (outOfBalance) {
    currentQuantity = getQuantityToBuy({
      price,
      total: BigNumber(balance).toFixed(),
      precision: tokenPrecision,
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

    const needUpdatePrice = isNeedToUpdatePrice({
      currentPrice: price,
      previousPrice: previousOrder.price,
      priceDiffPercent: bookBot.priceDiffPercent,
      type: MARKET_CONTRACT.BUY,
    });

    const needUpdateQuantity = isNeedToUpdateQuantity({
      previousOrderQuantity: previousOrder.quantity,
      bookQuantity: _.get(orderInBook, 'quantity'),
      updateQuantityPercent: bookBot.updateQuantityPercent,
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
      symbol: bookBot.symbol,
      price,
      quantity: BigNumber(currentQuantity).toFixed(tokenPrecision),
    }));
    await redisSetter.hmsetAsync(
      redisKey,
      { price, quantity: BigNumber(currentQuantity).toFixed(tokenPrecision) },
      expiredPostsClient,
    );
  }
  return handleLimitBuy({
    operations,
    bookBot,
    quantity: currentQuantity,
    balance: newBalance,
    tokenPrecision,
    tradeFeeMul,
    dieselPool,
    position: ++position,
    book,
    profitPercent: BigNumber(profitPercent).plus(bookBot.profitUpdateStep).toNumber(),
    lastOrderEXKey,
  });
};

const handleLimitSell = async ({
  operations,
  bookBot,
  quantity,
  balance,
  tokenPrecision,
  tradeFeeMul,
  dieselPool,
  position,
  book,
  profitPercent,
  lastOrderEXKey,
}) => {
  if (BigNumber(balance).eq(0)) {
    return { limitSellOperations: operations, limitSellCounter: position };
  }
  let needRenewOrder = false;
  let currentQuantity = BigNumber(quantity).times(bookBot.sellRatio);

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
    tradeFeeMul,
    bookBot,
    profitPercent,
  });

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
    const needUpdatePrice = isNeedToUpdatePrice({
      currentPrice: price,
      previousPrice: previousOrder.price,
      priceDiffPercent: bookBot.priceDiffPercent,
      type: MARKET_CONTRACT.SELL,
    });

    const needUpdateQuantity = isNeedToUpdateQuantity({
      previousOrderQuantity: previousOrder.quantity,
      bookQuantity: _.get(orderInBook, 'quantity'),
      updateQuantityPercent: bookBot.updateQuantityPercent,
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
      symbol: bookBot.symbol,
      price,
      quantity: BigNumber(currentQuantity).toFixed(tokenPrecision),
    }));
    await redisSetter.hmsetAsync(
      redisKey,
      { price, quantity: BigNumber(currentQuantity).toFixed(tokenPrecision) },
      expiredPostsClient,
    );
  }
  return handleLimitSell({
    operations,
    bookBot,
    quantity: currentQuantity,
    balance: newBalance,
    tokenPrecision,
    tradeFeeMul,
    dieselPool,
    position: ++position,
    book,
    profitPercent: BigNumber(profitPercent).plus(bookBot.profitUpdateStep).toNumber(),
    lastOrderEXKey,
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

const closeNoFundOrders = async ({
  positions, type, book, bookBot,
}) => {
  const operations = [];
  const redisPositions = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  const currentPositions = await redisGetter.smembers(redisPositions);
  const diff = _.difference(currentPositions, positions);
  if (_.isEmpty(diff)) return operations;
  for (const diffElement of diff) {
    const redisKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${diffElement}`;
    const orderCache = await redisGetter.getHashAll(redisKey, expiredPostsClient);
    const orderInBook = _.find(book,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(orderCache.price));
    if (orderInBook) {
      operations.push(getCancelParams({
        id: _.get(orderInBook, 'txId'),
        type,
      }));
    }
    await redisSetter.delKey(redisKey);
    await redisSetter.srem(redisPositions, diffElement);
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
      from: true,
      symbol: bookBot.symbol,
      tradeFeeMul,
      amountIn: quantity,
      pool,
      precision: HIVE_PEGGED_PRECISION,
      slippage,
    });
    const hiveQuantity = BigNumber(result.minAmountOut)
      .times(BigNumber(1).minus(profitPercent));
    const price = BigNumber(hiveQuantity).dividedBy(quantity).toFixed(HIVE_PEGGED_PRECISION);
    return price;
  }

  if (type === MARKET_CONTRACT.SELL) {
    const result = poolSwapHelper.getSwapOutput({
      from: false,
      symbol: bookBot.symbol,
      tradeFeeMul,
      amountIn: quantity,
      pool,
      precision: tokenPrecision,
      slippage,
    });
    const hiveAmountWithoutSlippage = BigNumber(result.amountOut)
      .times(BigNumber(1).minus(slippage))
      .toFixed(HIVE_PEGGED_PRECISION);
    const hiveQuantity = BigNumber(hiveAmountWithoutSlippage)
      .plus(result.fee)
      .times(BigNumber(1).plus(bookBot.profitPercent));
    const price = BigNumber(hiveQuantity).dividedBy(quantity).toFixed(HIVE_PEGGED_PRECISION);
    return price;
  }
};
