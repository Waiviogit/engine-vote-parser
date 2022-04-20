const _ = require('lodash');
const BigNumber = require('bignumber.js');
const {
  PYRAMIDAL_BOTS,
  SLIPPAGE,
} = require('../../constants/pyramidalBot');
const { validatePyramidalBot } = require('./helpers/validatePyramidalBotHelper');
const enginePool = require('../hiveEngine/marketPools');
const { POOL_FEE } = require('../../constants/bookBot');
const poolSwapHelper = require('../bookBot/helpers/poolSwapHelper');
const { bookBroadcastToChain } = require('../bookBot/helpers/bookBroadcastToChainHelper');
const tokensContract = require('../hiveEngine/tokensContract');
const { getPoolToSwap } = require('./helpers/getPoolToSwapHelper');
const { getObjectForTransfer } = require('./helpers/getObjectForTransferHelper');

exports.startPyramidalBot = async (tokenPair) => {
  const pyramidalBots = _.filter(PYRAMIDAL_BOTS,
    (bot) => _.includes(bot.tokenPairs, tokenPair));
  if (!pyramidalBots.length) return;

  for (const bot of pyramidalBots) {
    if (!validatePyramidalBot(bot)) {
      return console.error(`Invalid ${bot.account} bot params`);
    }

    await handleSwaps(_.cloneDeep(bot));
  }
};

const handleSwaps = async (bot) => {
  const requests = await Promise.all([
    enginePool.getMarketPools({
      query: { tokenPair: { $in: bot.tokenPairs } },
    }),
    enginePool.getMarketPoolsParams(),
    tokensContract.getTokensParams({
      query: {
        symbol: {
          $in:
            [bot.tokenSymbol, ...bot.stableTokens],
        },
      },
    }),
    tokensContract.getTokenBalances({
      query: { symbol: { $in: bot.stableTokens }, account: bot.account },
    }),
  ]);
  const [pools, params, tokens, balances] = requests;
  const isRequestError = _.has(pools, 'error') || _.has(params, 'error')
    || _.has(tokens, 'error') || _.has(balances, 'error');

  if (isRequestError) {
    console.error('-------error in pyramidalBot request');

    return;
  }

  const tradeFeeMul = _.get(params, '[0].tradeFeeMul', POOL_FEE);
  const poolsWithToken = _.filter(pools, (pool) => !_.includes(
    bot.stablePair,
    pool.tokenPair,
  ));
  const stablePool = _.find(pools, (pool) => _.includes(bot.stablePair, pool.tokenPair));
  const poolToBuy = getPoolToSwap({
    pools: poolsWithToken,
    bot,
    buy: true,
    stablePool,
    tokens,
    balances,
  });
  const poolToSell = getPoolToSwap({
    pools: poolsWithToken,
    bot,
    stablePool,
    tokens,
    balances,
  });

  const operations = [];

  getOperationsToBroadcast({
    poolToBuy, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool, operations,
  });
  if (operations.length) await bookBroadcastToChain({ bookBot: bot, operations });
};

const getOperationsToBroadcast = ({
  poolToBuy, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool, operations,
  startAmountIn = poolToBuy.balance, prevIncomeDifference = 0,
}) => {
  if (BigNumber(startAmountIn).isLessThan(bot.lowestAmountOutBound)) return;

  const tokenOutput = poolSwapHelper.getSwapOutput({
    symbol: poolToBuy.stableTokenSymbol,
    amountIn: startAmountIn,
    pool: _.find(poolsWithToken, (pool) => pool.tokenPair.includes(poolToBuy.tokenPair)),
    slippage: SLIPPAGE,
    from: true,
    tradeFeeMul,
    precision: poolToBuy.stableTokenPrecision,
  });
  const stableTokenOutput = poolSwapHelper.getSwapOutput({
    symbol: bot.tokenSymbol,
    amountIn: _.get(tokenOutput, 'amountOut'),
    pool: _.find(poolsWithToken, (pool) => pool.tokenPair.includes(poolToSell.tokenPair)),
    slippage: SLIPPAGE,
    from: true,
    tradeFeeMul,
    precision: poolToSell.tokenPrecision,
  });
  const equalizeTokensOutput = poolSwapHelper.getSwapOutput({
    symbol: poolToSell.stableTokenSymbol,
    amountIn: _.get(stableTokenOutput, 'amountOut'),
    pool: stablePool,
    slippage: SLIPPAGE,
    from: true,
    tradeFeeMul,
    precision: poolToSell.stableTokenPrecision,
  });

  const isAmountOutGreater = BigNumber(equalizeTokensOutput.amountOut).isGreaterThan(startAmountIn)
    && !BigNumber(startAmountIn).isLessThan(bot.lowestAmountOutBound);
  const isAmountOutLess = BigNumber(equalizeTokensOutput.amountOut).isLessThan(startAmountIn)
    && !operations.length;

  if (isAmountOutGreater) {
    const incomeDifference = BigNumber(equalizeTokensOutput.amountOut).minus(startAmountIn)
      .toFixed(poolToBuy.stableTokenPrecision);
    if (BigNumber(incomeDifference).isLessThan(prevIncomeDifference)) return;

    operations[0] = tokenOutput.json;
    operations[1] = stableTokenOutput.json;
    operations[2] = equalizeTokensOutput.json;
    operations[3] = getObjectForTransfer(poolToBuy.stableTokenSymbol, incomeDifference);

    getOperationsToBroadcast({
      poolToBuy,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
      operations,
      startAmountIn: BigNumber(startAmountIn)
        .dividedBy(2)
        .toFixed(poolToBuy.stableTokenPrecision),
      prevIncomeDifference: incomeDifference,
    });
  } else if (isAmountOutLess) {
    getOperationsToBroadcast({
      poolToBuy,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
      operations,
      startAmountIn: BigNumber(startAmountIn)
        .dividedBy(2)
        .toFixed(poolToBuy.stableTokenPrecision),
    });
  }
};
