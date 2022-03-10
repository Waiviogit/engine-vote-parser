const BigNumber = require('bignumber.js');
const { MARKET_CONTRACT } = require('constants/hiveEngine');
const _ = require('lodash');
const { HIVE_PEGGED_PRECISION } = require('constants/bookBot');

const getAmountOut = ({
  amountIn, liquidityIn, liquidityOut, tradeFeeMul,
}) => {
  const amountInWithFee = BigNumber(amountIn).times(tradeFeeMul);
  const num = BigNumber(amountInWithFee).times(liquidityOut);
  const den = BigNumber(liquidityIn).plus(amountInWithFee);
  const amountOut = num.dividedBy(den);
  // if (!BigNumber(amountOut).lt(liquidityOut)) return false;
  return amountOut;
};

const calcFee = ({
  tokenAmount, liquidityIn, liquidityOut, precision, tradeFeeMul,
}) => {
  const tokenAmountAdjusted = BigNumber(getAmountOut({
    amountIn: tokenAmount, liquidityIn, liquidityOut, tradeFeeMul,
  }));
  const fee = BigNumber(tokenAmountAdjusted).dividedBy(tradeFeeMul)
    .minus(tokenAmountAdjusted)
    .toFixed(precision, BigNumber.ROUND_HALF_UP);

  return fee;
};

const operationForJson = ({
  tokenPair,
  minAmountOut,
  tokenSymbol,
  tokenAmount,
}) => ({
  contractName: 'marketpools',
  contractAction: 'swapTokens',
  contractPayload: {
    tokenPair,
    tokenSymbol,
    tokenAmount,
    tradeType: 'exactInput',
    minAmountOut,
  },
});

exports.getSwapParams = ({
  event, bookBot, dieselPool, tradeFeeMul, tokenPrecision,
}) => {
  const tokenPairArr = bookBot.tokenPair.split(':');
  const slippage = 0.005;
  const tokensToProcess = event.action === MARKET_CONTRACT.BUY
    ? event.quantityTokens
    : event.quantityHive;
  const symbol = event.action === MARKET_CONTRACT.BUY
    ? bookBot.symbol
    : _.filter(tokenPairArr, (el) => el !== bookBot.symbol)[0];

  const precision = symbol === bookBot.symbol
    ? tokenPrecision
    : HIVE_PEGGED_PRECISION;

  return {
    amountIn: tokensToProcess,
    symbol,
    slippage,
    tradeFeeMul,
    from: true,
    pool: dieselPool,
    precision,
  };
};

exports.getSwapOutput = ({
  symbol, amountIn, pool, slippage, from, tradeFeeMul, precision,
}) => {
  if (!pool) return {};
  let liquidityIn;
  let liquidityOut;

  const {
    baseQuantity, quoteQuantity, tokenPair,
  } = pool;
  const [baseSymbol, quoteSymbol] = tokenPair.split(':');
  const isBase = symbol === baseSymbol;

  const tokenToExchange = isBase ? baseQuantity : quoteQuantity;

  const tokenExchangedOn = isBase ? quoteQuantity : baseQuantity;

  const absoluteValue = BigNumber(tokenToExchange).times(tokenExchangedOn);
  const tokenToExchangeNewBalance = from
    ? BigNumber(tokenToExchange).plus(amountIn)
    : BigNumber(tokenToExchange).minus(amountIn);

  const tokenExchangedOnNewBalance = absoluteValue.div(tokenToExchangeNewBalance);
  const amountOut = BigNumber(tokenExchangedOn)
    .minus(tokenExchangedOnNewBalance)
    .absoluteValue();

  const priceImpact = from
    ? BigNumber(amountIn)
      .times(100)
      .div(tokenToExchange)
    : BigNumber(amountOut)
      .times(100)
      .div(tokenExchangedOn);

  const newBalances = {
    tokenToExchange: tokenToExchangeNewBalance.toFixed(precision, BigNumber.ROUND_DOWN),
    tokenExchangedOn: tokenExchangedOnNewBalance.toFixed(precision, BigNumber.ROUND_DOWN),
  };

  const newPrices = {
    tokenToExchange: tokenToExchangeNewBalance
      .div(tokenExchangedOnNewBalance)
      .toFixed(precision, BigNumber.ROUND_DOWN),
    tokenExchangedOn: tokenExchangedOnNewBalance
      .div(tokenToExchangeNewBalance)
      .toFixed(precision, BigNumber.ROUND_DOWN),
  };

  const tokenSymbol = from
    ? symbol
    : symbol === baseSymbol
      ? quoteSymbol
      : baseSymbol;

  const tradeDirection = tokenSymbol === baseSymbol;
  if (tradeDirection) {
    liquidityIn = pool.baseQuantity;
    liquidityOut = pool.quoteQuantity;
  } else {
    liquidityIn = pool.quoteQuantity;
    liquidityOut = pool.baseQuantity;
  }

  const tokenAmount = from ? BigNumber(amountIn).toFixed() : amountOut;

  const slippageAmount = from ? amountOut.times(slippage) : BigNumber(amountIn).times(slippage);

  const fee = calcFee({
    tokenAmount, liquidityIn, liquidityOut, precision, tradeFeeMul,
  });
  const minAmountOut = from
    ? amountOut.minus(slippageAmount)
    : BigNumber(amountIn).minus(slippageAmount);

  // plus fee when from: false???
  const amountOutToFixed = amountOut.toFixed(precision, BigNumber.ROUND_DOWN);
  const minAmountOutToFixed = minAmountOut.minus(fee).toFixed(precision, BigNumber.ROUND_DOWN);

  const json = operationForJson({
    minAmountOut: minAmountOutToFixed,
    tokenPair,
    tokenSymbol,
    tokenAmount: BigNumber(tokenAmount).toFixed(precision, BigNumber.ROUND_DOWN),
  });

  return {
    fee,
    priceImpact: priceImpact.toFixed(2),
    minAmountOut: minAmountOutToFixed,
    amountOut: amountOutToFixed,
    newBalances,
    newPrices,
    json,
  };
};
