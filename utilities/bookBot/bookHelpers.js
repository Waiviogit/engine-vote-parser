const BigNumber = require('bignumber.js');
const _ = require('lodash');
const { MARKET_CONTRACT } = require('constants/hiveEngine');
const { bookBotSchema, bookPositionSchema, bookPercentSchema } = require('utilities/validation/bookBotValidation');

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
  let percentToSellSwap = BigNumber(0);
  let percentToSellSymbol = BigNumber(0);
  let percentToBuySwap = BigNumber(0);
  let percentToBuySymbol = BigNumber(0);
  const { value, error } = bookBotSchema.validate(bot);
  if (error) return false;
  const { positions } = value;
  for (const position in positions) {
    percentToSellSwap = percentToSellSwap.plus(positions[position].percentToSellSwap);
    percentToSellSymbol = percentToSellSymbol.plus(positions[position].percentToSellSymbol);
    percentToBuySwap = percentToBuySwap.plus(positions[position].percentToBuySwap);
    percentToBuySymbol = percentToBuySymbol.plus(positions[position].percentToBuySymbol);
    const { error: positionError } = bookPositionSchema.validate({
      positionBuy: positions[position].positionBuy,
      positionSell: positions[position].positionSell,
    });
    if (positionError) return false;
  }
  const { error: percentError } = bookPercentSchema.validate({
    percentToSellSwap: percentToSellSwap.toNumber(),
    percentToSellSymbol: percentToSellSymbol.toNumber(),
    percentToBuySwap: percentToBuySwap.toNumber(),
    percentToBuySymbol: percentToBuySymbol.toNumber(),
  });
  if (percentError) return false;
  return true;
};
