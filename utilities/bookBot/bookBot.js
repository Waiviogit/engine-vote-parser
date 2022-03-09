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
  getSwapParams,
  countTotalBalance,
  validateBookBot,
  getSwapExpenses,
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
    && !BigNumber(sellPrice).eq(0)
    && _.get(sellBook, '[0].account') !== bookBot.account;

  const marketSellCondition = BigNumber(buyPrice).gt(poolPrice)
    && !BigNumber(buyPrice).eq(0)
    && _.get(buyBook, '[0].account') !== bookBot.account;

  if (rcLeft && !event) handleBotRc({ rcLeft, bookBot });

  if (event) {
    return handleDeal({
      bookBot, dieselPool, event, tradeFeeMul, tokenPrecision,
    });
  }

  if (marketSellCondition) {
    const maxSellQuantity = poolSwapHelper.maxQuantityBookOrder({
      pool: dieselPool,
      type: MARKET_CONTRACT.SELL,
      price: sellPrice,
      tradeFeeMul,
      tokenPrecision,
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
      tokenPrecision,
    });
    return handleMarketBuy({
      sellPrice, swapBalance, tokenPrecision, bookBot, maxBuyQuantity, sellBook,
    });
  }

  const balanceLimitBuy = BigNumber(swapTotalBalance).times(bookBot.swapBalanceUsage)
    .minus(BigNumber(swapTotalBalance).times(bookBot.untouchedSwapPercent)).toFixed(HIVE_PEGGED_PRECISION);

  const balanceLimitSell = BigNumber(symbolTotalBalance).times(bookBot.symbolBalanceUsage)
    .minus(BigNumber(symbolTotalBalance).times(bookBot.untouchedSymbolPercent)).toFixed(tokenPrecision);

  const buyPositions = await handleLimitBuy({
    operations,
    bookBot,
    price: BigNumber(poolPrice).minus(poolPriceFee).toFixed(HIVE_PEGGED_PRECISION),
    balance: balanceLimitBuy,
    quantity: BigNumber(bookBot.startBuyQuantity)
      .dividedBy(bookBot.buyRatio).toFixed(tokenPrecision),
    tokenPrecision,
    tradeFeeMul,
    dieselPool,
    book: buyBook,
    position: START_POSITION,
  });

  const sellPositions = await handleLimitSell({
    operations,
    bookBot,
    price: BigNumber(poolPrice).plus(poolPriceFee).toFixed(HIVE_PEGGED_PRECISION),
    balance: balanceLimitSell,
    quantity: BigNumber(bookBot.startSellQuantity)
      .dividedBy(bookBot.sellRatio).toFixed(tokenPrecision),
    tokenPrecision,
    tradeFeeMul,
    dieselPool,
    book: sellBook,
    position: START_POSITION,
  });

  await handleCloseOrders({
    positions: makePositionsArray(buyPositions),
    type: MARKET_CONTRACT.BUY,
    book: buyBook,
    operations,
    bookBot,
  });

  await handleCloseOrders({
    positions: makePositionsArray(sellPositions),
    type: MARKET_CONTRACT.SELL,
    book: sellBook,
    operations,
    bookBot,
  });

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
  bookBot, dieselPool, tradeFeeMul, event, tokenPrecision,
}) => {
  // const eventPrice = BigNumber(event.quantityHive).dividedBy(event.quantityTokens).toFixed();
  // block 14852808
  const swapOutput = poolSwapHelper.getSwapOutput(poolSwapHelper.getSwapParams({
    event, bookBot, dieselPool, tradeFeeMul, tokenPrecision,
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

const handleLimitBuy = async ({
  operations,
  bookBot,
  price,
  quantity,
  balance,
  tokenPrecision,
  tradeFeeMul,
  dieselPool,
  position,
  book,
}) => {
  if (BigNumber(balance).eq(0)) return position;
  let needRenewOrder = false;
  const redisKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.BUY}:${bookBot.symbol}:${bookBot.account}:position${position}`;
  const redisPositions = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.BUY}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  await redisSetter.sadd(redisPositions, `position${position}`);
  const previousOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);
  if (previousOrder) {
    const orderInBook = _.find(book,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(previousOrder.price));
    if (!orderInBook) {
      await redisSetter.delKey(redisKey);
      return handleLimitBuy({
        operations,
        bookBot,
        price,
        quantity,
        balance,
        tokenPrecision,
        tradeFeeMul,
        dieselPool,
        position,
        book,
      });
    }
    const { needUpdateQuantity, needUpdatePrice } = getUpdateOrderConditions({
      bookBot, previousOrder, positionPrice: price, orderInBook,
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

  let currentQuantity = BigNumber(quantity).times(bookBot.buyRatio);
  const expenses = getSwapExpenses({ quantity: currentQuantity, price });

  const previousOrders = await previousOrdersQuantity({
    bookBot, position, type: MARKET_CONTRACT.BUY, tokenPrecision,
  });

  const maxBuyQuantity = poolSwapHelper.maxQuantityBookOrder({
    pool: dieselPool,
    type: MARKET_CONTRACT.BUY,
    price,
    tradeFeeMul,
    tokenPrecision,
    previousOrders,
  });

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
  const finalQuantity = orderQuantity({
    ourQuantity: currentQuantity, maxQuantity: maxBuyQuantity,
  });
  const newOrderCondition = orderCondition(finalQuantity) && (!previousOrder || needRenewOrder);
  if (newOrderCondition) {
    operations.push(getLimitBuyParams({
      symbol: bookBot.symbol,
      price,
      quantity: BigNumber(finalQuantity).toFixed(tokenPrecision),
    }));
    await redisSetter.hmsetAsync(
      redisKey,
      { price, quantity: BigNumber(finalQuantity).toFixed(tokenPrecision) },
      expiredPostsClient,
    );
  }
  return handleLimitBuy({
    operations,
    bookBot,
    price: BigNumber(price)
      .minus(BigNumber(price).times(bookBot.buyDiffPercent)).toFixed(HIVE_PEGGED_PRECISION),
    quantity: finalQuantity,
    balance: newBalance,
    tokenPrecision,
    tradeFeeMul,
    dieselPool,
    position: ++position,
    book,
  });
};

const handleLimitSell = async ({
  operations,
  bookBot,
  price,
  quantity,
  balance,
  tokenPrecision,
  tradeFeeMul,
  dieselPool,
  position,
  book,
}) => {
  if (BigNumber(balance).eq(0)) return position;
  let needRenewOrder = false;
  let currentQuantity = BigNumber(quantity).times(bookBot.sellRatio);

  const redisKey = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.SELL}:${bookBot.symbol}:${bookBot.account}:position${position}`;
  const redisPositions = `${REDIS_BOOK.MAIN}:${REDIS_BOOK.SELL}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  await redisSetter.sadd(redisPositions, `position${position}`);
  const previousOrder = await redisGetter.getHashAll(redisKey, expiredPostsClient);

  if (previousOrder) {
    const orderInBook = _.find(book,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(previousOrder.price));
    if (!orderInBook) {
      await redisSetter.delKey(redisKey);
      return handleLimitSell({
        operations,
        bookBot,
        price,
        quantity,
        balance,
        tokenPrecision,
        tradeFeeMul,
        dieselPool,
        position,
        book,
      });
    }
    const { needUpdateQuantity, needUpdatePrice } = getUpdateOrderConditions({
      bookBot, previousOrder, positionPrice: price, orderInBook,
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

  const previousOrders = await previousOrdersQuantity({
    bookBot, position, type: MARKET_CONTRACT.SELL, tokenPrecision,
  });

  const maxSellQuantity = poolSwapHelper.maxQuantityBookOrder({
    pool: dieselPool,
    type: MARKET_CONTRACT.SELL,
    price,
    tradeFeeMul,
    tokenPrecision,
    previousOrders,
  });

  let newBalance = BigNumber(balance).minus(currentQuantity).toFixed();
  const outOfBalance = BigNumber(newBalance).lte(0);
  if (outOfBalance) {
    currentQuantity = balance;
    newBalance = 0;
  }
  const finalQuantity = orderQuantity({
    ourQuantity: currentQuantity, maxQuantity: maxSellQuantity,
  });
  const newOrderCondition = orderCondition(finalQuantity) && (!previousOrder || needRenewOrder);
  if (newOrderCondition) {
    operations.push(getLimitSellParams({
      symbol: bookBot.symbol,
      price,
      quantity: BigNumber(finalQuantity).toFixed(tokenPrecision),
    }));
    await redisSetter.hmsetAsync(
      redisKey,
      { price, quantity: BigNumber(finalQuantity).toFixed(tokenPrecision) },
      expiredPostsClient,
    );
  }
  return handleLimitSell({
    operations,
    bookBot,
    price: BigNumber(price)
      .plus(BigNumber(price).times(bookBot.sellDiffPercent)).toFixed(HIVE_PEGGED_PRECISION),
    quantity: finalQuantity,
    balance: newBalance,
    tokenPrecision,
    tradeFeeMul,
    dieselPool,
    position: ++position,
    book,
  });
};

const previousOrdersQuantity = async ({
  type, position, bookBot, tokenPrecision,
}) => {
  const redisKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:position${position}`;
  let quantity = BigNumber(0);
  if (position === 0) return quantity.toFixed(tokenPrecision);
  for (let i = 0; i < position; i++) {
    const order = await redisGetter.getHashAll(redisKey, expiredPostsClient);
    quantity = quantity.plus(_.get(order, 'quantity', 0));
  }
  return quantity.toFixed(tokenPrecision);
};

const handleCloseOrders = async ({
  positions, type, book, operations, bookBot,
}) => {
  const redisPositions = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  const currentPositions = await redisGetter.smembers(redisPositions);
  const diff = _.difference(currentPositions, positions);
  if (_.isEmpty(diff)) return;
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
};

const makePositionsArray = (positions) => {
  const positionsArr = [];
  for (let i = 0; i < positions; i++) {
    positionsArr.push(`position${i}`);
  }
  return positionsArr;
};
