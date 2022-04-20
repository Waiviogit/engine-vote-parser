const _ = require('lodash');
const BigNumber = require('bignumber.js');
const {
  PYRAMIDAL_BOTS,
  SLIPPAGE,
  TEST_POOLS,
} = require('../../constants/pyramidalBot');
const { validatePyramidalBot } = require('./helpers/validatePyramidalBotHelper');
const enginePool = require('../hiveEngine/marketPools');
const { POOL_FEE } = require('../../constants/bookBot');
const poolSwapHelper = require('../bookBot/helpers/poolSwapHelper');
const { bookBroadcastToChain } = require('../bookBot/helpers/bookBroadcastToChainHelper');
const tokensContract = require('../hiveEngine/tokensContract');
const { getPoolToSwap } = require('./helpers/getPoolToSwapHelper');
const { getObjectForTransfer,
  getJsonsToBroadcast
} = require('./helpers/getObjectForBroadcastingHelper');
const { calculateOutputs } = require('./helpers/calculateOutputsHelper');

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
    // enginePool.getMarketPools({
    //   query: { tokenPair: { $in: bot.tokenPairs } },
    // }),
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
  const [params, tokens, balances] = requests;
  const pools = TEST_POOLS;
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
  console.log('poolToBuy', poolToBuy);
  const poolToSell = getPoolToSwap({
    pools: poolsWithToken,
    bot,
    stablePool,
    tokens,
    balances,
  });
  console.log('poolToSell', poolToSell);
  const operations = [];

  getProfitableSwapsLowerBound({
    poolToBuy,
    poolsWithToken,
    tradeFeeMul,
    bot,
    poolToSell,
    stablePool,
    operations,
    startAmountIn: 0.39,
    prevIncomeDifference: bot.startIncomeDifference,
  });
  getProfitableSwapsUpperBound({
    poolToBuy,
    poolsWithToken,
    tradeFeeMul,
    bot,
    poolToSell,
    stablePool,
    operations,
    multiplier: bot.startMultiplier,
    prevIncomeDifference: operations[0].incomeDifference,
  });
  console.log('operations', operations);
  if (operations.length) {
    await bookBroadcastToChain({
      bookBot: bot,
      operations: getJsonsToBroadcast({
        object: operations[operations.length - 1],
        symbol: poolToBuy.stableTokenSymbol,
        quantity: operations[operations.length - 1].incomeDifference,
      }),
    });
    console.log('blaa', getJsonsToBroadcast({
      object: operations[operations.length - 1],
      symbol: poolToBuy.stableTokenSymbol,
      quantity: operations[operations.length - 1].incomeDifference,
    }));
  }
};

const getProfitableSwapsLowerBound = ({
  poolToBuy, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool, operations, startAmountIn,
  prevIncomeDifference,
}) => {
  console.log('startAmountIn', startAmountIn);
  if (BigNumber(startAmountIn).isLessThan(bot.lowestAmountOutBound)) return;

  const { buyOutput, sellOutput, equalizeOutput } = calculateOutputs({
    poolToBuy, startAmountIn, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool,
  });

  const isAmountOutGreater = BigNumber(equalizeOutput.amountOut).isGreaterThan(startAmountIn)
    && !BigNumber(startAmountIn).isLessThan(bot.lowestAmountOutBound);
  const isAmountOutLess = BigNumber(equalizeOutput.amountOut).isLessThan(startAmountIn)
    && !operations.length;

  if (isAmountOutGreater) {
    const incomeDifference = BigNumber(equalizeOutput.amountOut).minus(startAmountIn)
      .toFixed(poolToBuy.stableTokenPrecision);
    console.log('incomeDifference', incomeDifference);
    if (BigNumber(incomeDifference).isLessThan(prevIncomeDifference)) return;

    // operations[0] = buyOutput.json;
    // operations[1] = sellOutput.json;
    // operations[2] = equalizeOutput.json;
    // operations[3] = getObjectForTransfer(poolToBuy.stableTokenSymbol, incomeDifference);
    // так? или пушем? если пуш - то тогда захватиться и позиция ранее
    operations[0] = {
      incomeDifference,
      startAmountIn,
      buyOutputJson: buyOutput.json,
      sellOutputJson: sellOutput.json,
      equalizeOutputJson: equalizeOutput.json,
    };

    getProfitableSwapsLowerBound({
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
    getProfitableSwapsLowerBound({
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

const getProfitableSwapsUpperBound = ({
  poolToBuy, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool, operations, multiplier,
  prevIncomeDifference,
}) => {
  console.log('multiplier', multiplier);
  const startAmountIn = BigNumber(operations[0].startAmountIn).multipliedBy(multiplier)
    .toFixed(poolToBuy.stableTokenPrecision);
  if (BigNumber(startAmountIn).isGreaterThan(0.39)) return;

  console.log('startAmountIn in up', startAmountIn);
  const { buyOutput, sellOutput, equalizeOutput } = calculateOutputs({
    poolToBuy, startAmountIn, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool,
  });
  console.log('equalizeOutput', equalizeOutput);
  const incomeDifference = BigNumber(equalizeOutput.amountOut).minus(startAmountIn)
    .toFixed(poolToBuy.stableTokenPrecision);
  console.log('incomeDifference in up', incomeDifference);
  const isAmountOutGreater = BigNumber(incomeDifference).isGreaterThan(operations[0].incomeDifference)
    && BigNumber(incomeDifference).isGreaterThan(prevIncomeDifference);

  if (isAmountOutGreater) {
    operations[1] = {
      incomeDifference,
      startAmountIn,
      buyOutputJson: buyOutput.json,
      sellOutputJson: sellOutput.json,
      equalizeOutputJson: equalizeOutput.json,
    };

    getProfitableSwapsUpperBound({
      poolToBuy,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
      operations,
      multiplier: multiplier - 0.1,
      prevIncomeDifference: incomeDifference,
    });
  }
};
