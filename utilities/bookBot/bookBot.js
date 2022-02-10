const { BOOK_BOTS, POOL_FEE } = require('constants/bookBot');
const _ = require('lodash');
const engineMarket = require('utilities/hiveEngine/market');
const enginePool = require('utilities/hiveEngine/marketPools');
const tokensContract = require('utilities/hiveEngine/tokensContract');
const BigNumber = require('bignumber.js');

const sendBookEvent = async ({ symbol }) => {
  const bookBot = _.find(BOOK_BOTS, (bot) => bot.symbol === symbol);
  if (!bookBot) return;
  await handleBookEvent({ bookBot });
};

// rc!!!
// if action buy or sale твоей ставки ребалансировка
const handleBookEvent = async ({ bookBot }) => {
  const operations = [];

  const balances = await tokensContract.getTokenBalances({
    query: { symbol: { $in: ['SWAP.HIVE', bookBot.symbol] }, account: bookBot.account },
  });
  const swapBalance = getFormattedBalance(balances);
  const symbolBalance = getFormattedBalance(balances, bookBot.symbol);

  const [token = {}] = await tokensContract.getTokensParams({ query: { symbol: bookBot.symbol } });
  const buyBook = await engineMarket.getBuyBook({ query: { symbol: bookBot.symbol } });
  const sellBook = await engineMarket.getSellBook({ query: { symbol: bookBot.symbol } });
  const [dieselPool = {}] = await enginePool.getMarketPools({ query: { tokenPair: bookBot.tokenPair } });
  if (_.isEmpty(dieselPool)) return;

  const buyPrice = _.get(buyBook, '[0].price', '0');
  const sellPrice = _.get(sellBook, '[0].price', '0');
  const poolPrice = getDieselPoolPrice({ dieselPool, bookBot });
  const buyPriceIsMine = _.get(buyBook, '[0].account') === bookBot.account;
  const sellPriceIsMine = _.get(sellBook, '[0].account') === bookBot.account;

  const poolPriceFee = BigNumber(poolPrice).times(POOL_FEE).toFixed();

  const nextBuyPrice = BigNumber(buyPrice).plus(getPrecisionPrice(token.precision)).toFixed();
  const nextSellPrice = BigNumber(sellPrice).minus(getPrecisionPrice(token.precision)).toFixed();

  if (BigNumber(buyPrice).gt(poolPrice)) {
    // много хотят купить по цене выше пула продаем и меняем в пуле по более выгодной цене
    // валидировать количество чтоб не влияло на пул
    // продаем symbol получаем swap
    operations.push(getMarketSellParams({ symbol: bookBot.symbol, quantity: _.get(buyBook, '[0].quantity') }));
    console.log('market sell');
  }

  if (BigNumber(sellPrice).lt(poolPrice)) {
    // много хотят продать по цене ниже пула - покупаем
    // валидировать количество чтоб не влияло на пул
    // продаем swap получаем symbol
    operations.push(getMarketBuyParams({ symbol: bookBot.symbol, quantity: _.get(sellBook, '[0].quantity') }));

    console.log('market buy');
  }

  // can add pool price + 0.25 percent
  if (!buyPriceIsMine && BigNumber(nextBuyPrice).lt(poolPrice)) {
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
        total: BigNumber(swapBalance).times(bookBot.tradePercent).toFixed(),
      }),
    }));
  }

  if (buyPriceIsMine) {
    const previousBuyPrice = _.get(buyBook, '[1].price', '0');
    const conditionToCancelOrder = BigNumber(buyPrice).minus(previousBuyPrice)
      .gt(getPrecisionPrice(token.precision));

    if (conditionToCancelOrder) {
      operations.push(getCancelParams({
        id: _.get(buyBook, '[0].txId'),
        type: 'buy',
      }));
      operations.push(getLimitBuyParams({
        symbol: bookBot.symbol,
        price: BigNumber(previousBuyPrice).plus(getPrecisionPrice(token.precision)),
        quantity: getQuantityToBuy({
          price: BigNumber(previousBuyPrice).plus(getPrecisionPrice(token.precision)),
          total: BigNumber(swapBalance).times(bookBot.tradePercent).toFixed(),
        }),
      }));
    }
    const currentQuantity = _.get(buyBook, '[0].quantity', '0');
    const halfOfQuantity = getQuantityToBuy({
      price: buyPrice,
      total: BigNumber(swapBalance).times(bookBot.tradePercent).dividedBy(2).toFixed(),
    });
    const conditionForRechargeBalance = BigNumber(currentQuantity).lt(halfOfQuantity);
    if (!conditionToCancelOrder && conditionForRechargeBalance) {
      operations.push(getCancelParams({
        id: _.get(buyBook, '[0].txId'),
        type: 'buy',
      }));
      operations.push(getLimitBuyParams({
        symbol: bookBot.symbol,
        price: buyPrice,
        quantity: getQuantityToBuy({
          price: buyPrice,
          total: BigNumber(swapBalance).times(bookBot.tradePercent).toFixed(),
        }),
      }));
    }
  }
  // can add pool price - 0.25 percent
  if (!sellPriceIsMine && BigNumber(nextSellPrice).gt(poolPrice)) {
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
      quantity: BigNumber(symbolBalance).times(bookBot.tradePercent).toFixed(),
    }));
  }

  if (sellPriceIsMine) {
    const previousSellPrice = _.get(sellBook, '[1].price', '0');
    const conditionToCancelOrder = BigNumber(previousSellPrice).minus(sellPrice)
      .gt(getPrecisionPrice(token.precision));

    if (conditionToCancelOrder) {
      operations.push(getCancelParams({
        id: _.get(sellBook, '[0].txId'),
        type: 'sell',
      }));
      operations.push(getLimitSellParams({
        symbol: bookBot.symbol,
        price: BigNumber(previousSellPrice).minus(getPrecisionPrice(token.precision)),
        quantity: BigNumber(symbolBalance).times(bookBot.tradePercent).toFixed(),
      }));
      // take into account frozen sum
    }
    const currentQuantity = _.get(sellBook, '[0].quantity', '0');
    const halfOfQuantity = BigNumber(symbolBalance).times(bookBot.tradePercent)
      .dividedBy(2).toFixed();

    const conditionForRechargeBalance = BigNumber(currentQuantity).lt(halfOfQuantity);
    if (!conditionToCancelOrder && conditionForRechargeBalance) {
      operations.push(getCancelParams({
        id: _.get(sellBook, '[0].txId'),
        type: 'sell',
      }));
      operations.push(getLimitSellParams({
        symbol: bookBot.symbol,
        price: sellPrice,
        quantity: BigNumber(symbolBalance).times(bookBot.tradePercent).toFixed(),
      }));
    }
  }
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
// use when buy because we know quantity we sell in waiv
// when buy freeze swap.hive when sell freeze waiv
const getQuantityToBuy = ({ price, total }) => BigNumber(total).dividedBy(price).toFixed();

const getFormattedBalance = (balances, symbol = 'SWAP.HIVE') => {
  const balanceInfo = _.find(balances, (b) => b.symbol === 'SWAP.HIVE');
  return _.get(balanceInfo, 'balance', '0');
};

// (async () => {
//   const bookBot = {
//     account: 'flowmaster',
//     symbol: 'WAIV',
//     tokenPair: 'SWAP.HIVE:WAIV',
//     tradePercent: 0.2,
//   };
//   await handleBookEvent({ bookBot });
// })();
