const BigNumber = require('bignumber.js');
const _ = require('lodash');
const { MARKET_CONTRACT } = require('constants/hiveEngine');
const { bookBotSchema } = require('utilities/validation/bookBotValidation');
const { HIVE_PEGGED_PRECISION } = require('constants/bookBot');

exports.getQuantityToBuy = ({ price, total, precision }) => BigNumber(total)
  .dividedBy(price).toFixed(precision);

exports.getSwapExpenses = ({ quantity, price }) => BigNumber(quantity)
  .times(price).toFixed(HIVE_PEGGED_PRECISION);

exports.getFormattedBalance = (balances, symbol = 'SWAP.HIVE') => {
  const balanceInfo = _.find(balances, (b) => b.symbol === symbol);
  return _.get(balanceInfo, 'balance', '0');
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

exports.validateBookBot = (bot) => {
  const { error } = bookBotSchema.validate(bot);
  if (error) return false;
  return true;
};
