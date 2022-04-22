const _ = require('lodash');
const BigNumber = require('bignumber.js');
const {
  PYRAMIDAL_BOTS,
} = require('../../constants/pyramidalBot');
const { validatePyramidalBot } = require('./helpers/validatePyramidalBotHelper');
const enginePool = require('../hiveEngine/marketPools');
const { POOL_FEE } = require('../../constants/bookBot');
const { bookBroadcastToChain } = require('../bookBot/helpers/bookBroadcastToChainHelper');
const tokensContract = require('../hiveEngine/tokensContract');
const { getPoolToSwap } = require('./helpers/getPoolToSwapHelper');
const { getJsonsToBroadcast } = require('./helpers/getObjectForBroadcastingHelper');
const { calculateOutputs } = require('./helpers/calculateOutputsHelper');
const { zadd } = require('../redis/redisSetter');

exports.startPyramidalBot = async (trigger) => {
  const pyramidalBots = _.filter(PYRAMIDAL_BOTS,
    (bot) => _.includes(bot.tokenPairs, trigger.tokenPair));
  if (!pyramidalBots.length) return;

  for (const bot of pyramidalBots) {
    if (!validatePyramidalBot(bot)) {
      return console.error(`Invalid ${bot.account} bot params`);
    }

    await handleSwaps(_.cloneDeep(bot), trigger);
  }
};

const handleSwaps = async (bot, trigger) => {
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

  getFirstProfitableSwapPoint({
    poolToBuy,
    poolsWithToken,
    tradeFeeMul,
    bot,
    poolToSell,
    stablePool,
    operations,
    startAmountIn: poolToBuy.balance,
    prevIncomeDifference: bot.startIncomeDifference,
  });

  if (operations.length) {
    approachMostProfitableSwapPoint({
      poolToBuy,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
      operations,
      approachCoefficient: bot.approachCoefficient,
      prevIncomeDifference: operations[0].incomeDifference,
      lowerStartAmountIn: operations[0].startAmountIn,
      upperStartAmountIn: operations[0].startAmountIn,
    });

    const result = await bookBroadcastToChain({
      bookBot: bot,
      operations: getJsonsToBroadcast({
        object: operations[operations.length - 1],
        symbol: poolToBuy.stableTokenSymbol,
        quantity: operations[operations.length - 1].incomeDifference,
      }),
    });
    /** setting data to redis to check triggers */
    await zadd({ value: `${trigger.tokenPair}|${trigger.transactionId}|${result}` });
  }
};

const getFirstProfitableSwapPoint = ({
  poolToBuy, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool, operations, startAmountIn,
  prevIncomeDifference,
}) => {
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
    if (BigNumber(incomeDifference).isLessThan(prevIncomeDifference)) return;

    operations[0] = {
      incomeDifference,
      startAmountIn,
      buyOutputJson: buyOutput.json,
      sellOutputJson: sellOutput.json,
      equalizeOutputJson: equalizeOutput.json,
    };

    getFirstProfitableSwapPoint({
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
    getFirstProfitableSwapPoint({
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
      prevIncomeDifference,
    });
  }
};

const approachMostProfitableSwapPoint = ({
  poolToBuy, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool, operations,
  approachCoefficient, prevIncomeDifference, lowerStartAmountIn, upperStartAmountIn,
}) => {
  let lowerIncomeDifferenceObject;
  let upperIncomeDifferenceObject;

  if (lowerStartAmountIn) {
    lowerStartAmountIn = BigNumber(lowerStartAmountIn)
      .multipliedBy(approachCoefficient).toFixed(poolToBuy.stableTokenPrecision);

    const isOutOfRange = BigNumber(lowerStartAmountIn)
      .isLessThan(BigNumber(operations[0].startAmountIn).div(2));
    if (isOutOfRange) return;

    lowerIncomeDifferenceObject = getIncomeDifference({
      poolToBuy,
      startAmountIn: lowerStartAmountIn,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
    });
  }

  if (upperStartAmountIn) {
    upperStartAmountIn = BigNumber(upperStartAmountIn)
      .dividedBy(approachCoefficient).toFixed(poolToBuy.stableTokenPrecision);

    const isOutOfRange = BigNumber(upperStartAmountIn).isGreaterThan(BigNumber(operations[0].startAmountIn).times(2))
      || BigNumber(upperStartAmountIn).isGreaterThan(poolToBuy.balance);
    if (isOutOfRange) return;

    upperIncomeDifferenceObject = getIncomeDifference({
      poolToBuy,
      startAmountIn: upperStartAmountIn,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
    });
  }

  const incomeDifferenceObject = pickIncomeDifferenceObject(
    lowerIncomeDifferenceObject,
    upperIncomeDifferenceObject,
  );

  const isAmountOutGreater = BigNumber(incomeDifferenceObject.incomeDifference).isGreaterThan(operations[0].incomeDifference)
    && BigNumber(incomeDifferenceObject.incomeDifference).isGreaterThan(prevIncomeDifference);

  if (isAmountOutGreater) {
    operations[1] = {
      incomeDifference: incomeDifferenceObject.incomeDifference,
      startAmountIn: incomeDifferenceObject.startAmountIn,
      buyOutputJson: incomeDifferenceObject.buyOutputJson,
      sellOutputJson: incomeDifferenceObject.sellOutputJson,
      equalizeOutputJson: incomeDifferenceObject.equalizeOutputJson,
    };

    approachMostProfitableSwapPoint({
      poolToBuy,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
      operations,
      approachCoefficient,
      prevIncomeDifference: incomeDifferenceObject.incomeDifference,
      lowerStartAmountIn: incomeDifferenceObject === lowerIncomeDifferenceObject
        ? incomeDifferenceObject.startAmountIn : '',
      upperStartAmountIn: incomeDifferenceObject === upperIncomeDifferenceObject
        ? incomeDifferenceObject.startAmountIn : '',
    });
  }
};

const getIncomeDifference = ({
  poolToBuy, startAmountIn, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool,
}) => {
  const { buyOutput, sellOutput, equalizeOutput } = calculateOutputs({
    poolToBuy,
    startAmountIn,
    poolsWithToken,
    tradeFeeMul,
    bot,
    poolToSell,
    stablePool,
  });

  return {
    incomeDifference: BigNumber(equalizeOutput.amountOut).minus(startAmountIn)
      .toFixed(poolToBuy.stableTokenPrecision),
    startAmountIn,
    buyOutputJson: buyOutput.json,
    sellOutputJson: sellOutput.json,
    equalizeOutputJson: equalizeOutput.json,
  };
};

const pickIncomeDifferenceObject = (lowerIncomeDifferenceObject, upperIncomeDifferenceObject) => {
  if (!lowerIncomeDifferenceObject) return upperIncomeDifferenceObject;

  if (!upperIncomeDifferenceObject) return lowerIncomeDifferenceObject;

  return BigNumber(lowerIncomeDifferenceObject.incomeDifference)
    .isGreaterThan(upperIncomeDifferenceObject.incomeDifference)
    ? lowerIncomeDifferenceObject : upperIncomeDifferenceObject;
};
