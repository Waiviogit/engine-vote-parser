const BigNumber = require('bignumber.js');
const axios = require('axios');

const getAmountOut = (params, amountIn, liquidityIn, liquidityOut) => {
  const amountInWithFee = BigNumber(amountIn).times(params.tradeFeeMul);
  const num = BigNumber(amountInWithFee).times(liquidityOut);
  const den = BigNumber(liquidityIn).plus(amountInWithFee);
  const amountOut = num.dividedBy(den);
  // if (!BigNumber(amountOut).lt(liquidityOut)) return false;
  return amountOut;
};

const calcFee = ({
  params, tokenAmount, liquidityIn, liquidityOut, precision,
}) => {
  const tokenAmountAdjusted = BigNumber(getAmountOut(params, tokenAmount, liquidityIn, liquidityOut));
  const fee = BigNumber(tokenAmountAdjusted).dividedBy(params.tradeFeeMul)
    .minus(tokenAmountAdjusted)
    .toFixed(precision, BigNumber.ROUND_HALF_UP);

  return fee;
};

const createJSON = ({
  tokenPair,
  minAmountOut,
  tokenSymbol,
  tokenAmount,
}) => JSON.stringify({
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

const getSwapOutput = ({
  symbol, amountIn, pool, slippage, from, params,
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
    params, tokenAmount, liquidityIn, liquidityOut, precision,
  });
  const minAmountOut = from
    ? amountOut.minus(slippageAmount)
    : BigNumber(amountIn).minus(slippageAmount);

  // plus fee when from: false???
  const amountOutToFixed = amountOut.toFixed(precision, BigNumber.ROUND_DOWN);
  const minAmountOutToFixed = minAmountOut.minus(fee).toFixed(precision, BigNumber.ROUND_DOWN);

  const json = createJSON({
    minAmountOut: minAmountOutToFixed,
    tokenPair,
    tokenSymbol,
    tokenAmount,
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

// (async () => {
//   const { data: { result: [params] } } = await axios.post(
//     'https://api2.hive-engine.com/rpc/contracts',
//     {
//       jsonrpc: '2.0',
//       method: 'find',
//       params: {
//         contract: 'marketpools',
//         table: 'params',
//         query: {},
//       },
//       id: 'ssc-mainnet-hive',
//     },
//   );
//   const { data: { result: [pool] } } = await axios.post(
//     'https://api2.hive-engine.com/rpc/contracts',
//     {
//       jsonrpc: '2.0',
//       method: 'find',
//       params: {
//         contract: 'marketpools',
//         table: 'pools',
//         query: { tokenPair: 'SWAP.HIVE:WAIV' },
//       },
//       id: 'ssc-mainnet-hive',
//     },
//   );
//   const result = await getSwapOutput({
//     pool,
//     params,
//     amountIn: 10,
//     slippage: 0.01,
//     symbol: 'SWAP.HIVE',
//     from: false,
//   });
//   console.log('yo');
// })();