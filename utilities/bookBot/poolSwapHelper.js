const BigNumber = require('bignumber.js');
const { MARKET_CONTRACT } = require('constants/hiveEngine');

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

exports.getSwapOutput = ({
  symbol, amountIn, pool, slippage, from, tradeFeeMul,
}) => {
  if (!pool) return {};
  let liquidityIn;
  let liquidityOut;

  const {
    baseQuantity, quoteQuantity, tokenPair, precision,
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

exports.maxQuantityBookOrder = ({
  pool, type, price, tradeFeeMul,
}) => {
  const slippage = 0.005;
  const {
    baseQuantity, quoteQuantity, tokenPair, precision,
  } = pool;
  const [baseSymbol] = tokenPair.split(':');
  const hiveQuantity = baseSymbol === 'SWAP.HIVE'
    ? baseQuantity
    : quoteQuantity;
  const symbolQuantity = baseSymbol === 'SWAP.HIVE'
    ? quoteQuantity
    : baseQuantity;

  const poolPrice = BigNumber(hiveQuantity).dividedBy(symbolQuantity).toFixed(precision);

  if (type === MARKET_CONTRACT.SELL) {
    const priceImpact = BigNumber(100).minus(
      BigNumber(poolPrice).times(100).dividedBy(price),
    ).toFixed();
    const quantity = BigNumber(priceImpact).times(hiveQuantity).dividedBy(100).toFixed(precision);
    const { minAmountOut } = this.getSwapOutput({
      pool,
      symbol: 'SWAP.HIVE',
      from: true,
      tradeFeeMul,
      slippage,
      amountIn: quantity,
    });
    return minAmountOut;
    // after => swap from swap.hive to waiv
  }

  if (type === MARKET_CONTRACT.BUY) {
    const priceImpact = BigNumber(100).minus(
      BigNumber(price).times(100).dividedBy(poolPrice),
    ).toFixed();
    return BigNumber(priceImpact).times(symbolQuantity).dividedBy(100).toFixed(precision);
    // after => swap from waiv to swap.hive
  }
  return '0';
};
