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
    tradeFeeMul,
    precision: poolToBuy.poolPrecision,
  });
  const sellOutput = poolSwapHelper.getSwapOutput({
    symbol: bot.tokenSymbol,
    amountIn: BigNumber(_.get(buyOutput, 'amountOut')).toFixed(bot.tokenPrecision),
    pool: _.find(poolsWithToken, (pool) => pool.tokenPair.includes(poolToSell.tokenPair)),
    slippage: SLIPPAGE,
    from: true,
    tradeFeeMul,
    precision: poolToSell.poolPrecision,
  });
  const equalizeOutput = poolSwapHelper.getSwapOutput({
    symbol: poolToSell.stableTokenSymbol,
    amountIn: BigNumber(_.get(sellOutput, 'amountOut')).toFixed(poolToSell.stableTokenPrecision),
    pool: stablePool,
    slippage: SLIPPAGE,
    from: true,
    tradeFeeMul,
    precision: stablePool.precision,
  });

  return { buyOutput, sellOutput, equalizeOutput };
};
