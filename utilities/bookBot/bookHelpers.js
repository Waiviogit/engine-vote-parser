const BigNumber = require('bignumber.js');
const _ = require('lodash');
const { MARKET_CONTRACT } = require('constants/hiveEngine');

exports.getQuantityToBuy = ({ price, total, precision }) => BigNumber(total)
  .dividedBy(price).toFixed(precision);

exports.getFormattedBalance = (balances, symbol = 'SWAP.HIVE') => {
  const balanceInfo = _.find(balances, (b) => b.symbol === symbol);
  return _.get(balanceInfo, 'balance', '0');
};

exports.getPrecisionPrice = (precision) => {
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

exports.getDieselPoolPrice = ({ dieselPool, bookBot }) => {
  const [base] = dieselPool.tokenPair.split(':');
  return base === bookBot.symbol
    ? dieselPool.basePrice
    : dieselPool.quotePrice;
};

// limit orders
exports.getLimitBuyParams = ({ symbol, quantity, price }) => ({
  contractName: 'market',
  contractAction: MARKET_CONTRACT.BUY,
  contractPayload: { symbol, quantity, price },
});

exports.getLimitSellParams = ({ symbol, quantity, price }) => ({
  contractName: 'market',
  contractAction: MARKET_CONTRACT.SELL,
  contractPayload: { symbol, quantity, price },
});

// market orders
exports.getMarketBuyParams = ({ symbol, quantity }) => ({
  contractName: 'market',
  contractAction: MARKET_CONTRACT.MARKET_BUY,
  contractPayload: { symbol, quantity },
});

exports.getMarketSellParams = ({ symbol, quantity }) => ({
  contractName: 'market',
  contractAction: MARKET_CONTRACT.MARKET_SELL,
  contractPayload: { symbol, quantity },
});

exports.getCancelParams = ({ type, id }) => ({
  contractName: 'market',
  contractAction: MARKET_CONTRACT.CANCEL,
  contractPayload: { type, id },
});

exports.orderQuantity = ({ ourQuantity, maxQuantity }) => (BigNumber(ourQuantity).gt(maxQuantity)
  ? maxQuantity
  : ourQuantity);

exports.orderCondition = (quantity) => BigNumber(quantity).gt(0);

exports.getSwapParams = ({
  event, bookBot, dieselPool, tradeFeeMul,
}) => {
  const tokenPairArr = bookBot.tokenPair.split(':');
  const slippage = 0.005;
  const tokensToProcess = event.action === MARKET_CONTRACT.BUY
    ? event.quantityHive
    : event.quantityTokens;
  const symbol = event.action === MARKET_CONTRACT.BUY
    ? _.filter(tokenPairArr, (el) => el !== bookBot.symbol)[0]
    : bookBot.symbol;

  const tradeFee = BigNumber(tokensToProcess).dividedBy(tradeFeeMul);
  const slippagePercent = BigNumber(tokensToProcess).times(slippage);

  const amountIn = BigNumber(tradeFee).plus(slippagePercent).toFixed();
  return {
    amountIn,
    symbol,
    slippage,
    tradeFeeMul,
    from: false,
    pool: dieselPool,
  };
};

exports.handleOpenOrders = ({
  operations, bookBot, buyBook, sellBook,
}) => {
  const addOrdersToCancel = [];
  const buyOrders = _.find(operations,
    (operation) => operation.contractAction === MARKET_CONTRACT.BUY);
  const sellOrders = _.find(operations,
    (operation) => operation.contractAction === MARKET_CONTRACT.SELL);
  const cancelOrders = _.filter(operations,
    (operation) => operation.contractAction === MARKET_CONTRACT.CANCEL);

  if (buyOrders) {
    const myBuyOrders = _.filter(buyBook, (el) => el.account === bookBot.account);
    const notCanceledOrders = _.filter(myBuyOrders,
      (order) => !_.some(cancelOrders, (cancel) => cancel.contractPayload.id === order.txId));
    for (const notCanceledOrder of notCanceledOrders) {
      addOrdersToCancel.push(this.getCancelParams({
        id: _.get(notCanceledOrder, 'txId'),
        type: MARKET_CONTRACT.BUY,
      }));
    }
  }
  if (sellOrders) {
    const mySellOrders = _.filter(sellBook, (el) => el.account === bookBot.account);
    const notCanceledOrders = _.filter(mySellOrders,
      (order) => !_.some(cancelOrders, (cancel) => cancel.contractPayload.id === order.txId));
    for (const notCanceledOrder of notCanceledOrders) {
      addOrdersToCancel.push(this.getCancelParams({
        id: _.get(notCanceledOrder, 'txId'),
        type: MARKET_CONTRACT.SELL,
      }));
    }
  }
  return addOrdersToCancel;
};

exports.countTotalBalance = ({
  book, hivePegged = false, balance, botName, precision,
}) => {
  const totalBalance = _.reduce(book, (accum, el) => {
    if (el.account === botName) {
      accum = BigNumber(accum).plus(hivePegged ? el.tokensLocked : el.quantity);
    }
    return accum;
  }, BigNumber(balance));
  return BigNumber(totalBalance).toFixed(precision);
};
