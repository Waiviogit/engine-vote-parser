const _ = require('lodash');
const BigNumber = require('bignumber.js');
const poolSwapHelper = require('../../bookBot/helpers/poolSwapHelper');
const { SLIPPAGE } = require('../../../constants/pyramidalBot');

exports.calculateOutputs = ({
  poolToBuy, startAmountIn, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool,
}) => {
  const buyOutput = poolSwapHelper.getSwapOutput({
    symbol: poolToBuy.stableTokenSymbol,
    amountIn: startAmountIn,
    pool: _.find(poolsWithToken, (pool) => pool.tokenPair.includes(poolToBuy.tokenPair)),
    slippage: SLIPPAGE,
    from: true,
    tradeFeeMul: bot.ourPool ? 1 : tradeFeeMul,
    precisionOut: bot.tokenPrecision,
    precisionIn: poolToBuy.stableTokenPrecision,
  });
  const sellOutput = poolSwapHelper.getSwapOutput({
    symbol: bot.tokenSymbol,
    amountIn: BigNumber(_.get(buyOutput, 'minAmountOut')).toFixed(bot.tokenPrecision),
    pool: _.find(poolsWithToken, (pool) => pool.tokenPair.includes(poolToSell.tokenPair)),
    slippage: SLIPPAGE,
    from: true,
    tradeFeeMul: bot.ourPool ? 1 : tradeFeeMul,
    precisionOut: poolToSell.stableTokenPrecision,
    precisionIn: bot.tokenPrecision,
  });
  const equalizeOutput = poolSwapHelper.getSwapOutput({
    symbol: poolToSell.stableTokenSymbol,
    amountIn: BigNumber(_.get(sellOutput, 'minAmountOut')).toFixed(poolToSell.stableTokenPrecision),
    pool: stablePool,
    slippage: SLIPPAGE,
    from: true,
    tradeFeeMul,
    precisionOut: poolToBuy.stableTokenPrecision,
    precisionIn: poolToSell.stableTokenPrecision,
  });

  return { buyOutput, sellOutput, equalizeOutput };
};
