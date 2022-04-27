const _ = require('lodash');
const BigNumber = require('bignumber.js');
const moment = require('moment');
const {
  PYRAMIDAL_BOTS,
  TWO_DAYS_IN_SECONDS,
} = require('../../constants/pyramidalBot');
const { validatePyramidalBot } = require('./helpers/validatePyramidalBotHelper');
const enginePool = require('../hiveEngine/marketPools');
const { POOL_FEE } = require('../../constants/bookBot');
const { bookBroadcastToChain } = require('../bookBot/helpers/bookBroadcastToChainHelper');
const tokensContract = require('../hiveEngine/tokensContract');
const { getPoolToSwap } = require('./helpers/getPoolToSwapHelper');
const { getJsonsToBroadcast } = require('./helpers/getObjectForBroadcastingHelper');
const { calculateOutputs } = require('./helpers/calculateOutputsHelper');
const {
  zadd,
  zremrangebyscore,
  hmsetAsync,
  expire,
} = require('../redis/redisSetter');
const { getObjectForRedis } = require('./helpers/getObjectForRedisHelper');
const { HIVE_ENGINE_NODES } = require('../../constants/appData');

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
  console.time('hive engine requests');
  const requests = await Promise.all([
    enginePool.getMarketPools({
      query: { tokenPair: { $in: bot.tokenPairs } },
      hostUrl: HIVE_ENGINE_NODES[1],
    }),
    enginePool.getMarketPoolsParams({ hostUrl: HIVE_ENGINE_NODES[1] }),
    tokensContract.getTokensParams({
      query: {
        symbol: {
          $in:
            [bot.tokenSymbol, ...bot.stableTokens],
        },
      },
      hostUrl: HIVE_ENGINE_NODES[1],
    }),
    tokensContract.getTokenBalances({
      query: { symbol: { $in: bot.stableTokens }, account: bot.account },
      hostUrl: HIVE_ENGINE_NODES[1],
    }),
  ]);
  console.timeEnd('hive engine requests');
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

  console.time('getFirstProfitableSwapPoint');
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
  console.timeEnd('getFirstProfitableSwapPoint');

  if (operations.length) {
    console.time('approachMostProfitableSwapPoint');
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
    console.timeEnd('approachMostProfitableSwapPoint');

    console.time('broadcast');
    const result = await bookBroadcastToChain({
      bookBot: bot,
      operations: getJsonsToBroadcast({
        object: operations[operations.length - 1],
        symbol: poolToBuy.stableTokenSymbol,
        quantity: operations[operations.length - 1].incomeDifference,
      }),
    });
    console.timeEnd('broadcast');

    await updateDataInRedis({
      trigger, result, poolToBuy, poolToSell, stablePool,
    });
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

const updateDataInRedis = async ({
  trigger, result, poolToBuy, poolToSell, stablePool,
}) => {
  /** clear sorted set from members older than a day */
  await zremrangebyscore({ min: 1, max: moment.utc().subtract(1, 'day').unix() });

  /** setting data to redis to check triggers */
  await zadd({ value: `${trigger.tokenPair}|${trigger.transactionId}|${result}` });

  const timestamp = moment.utc().unix();
  /** save hashes with pools data  and set ttl to delete old hashes */
  for (let count = 0; count < 3; count++) {
    let data;
    const key = `${count}:${result}-${count}`;

    if (count === 0) data = getObjectForRedis(poolToBuy, timestamp);
    if (count === 1) data = getObjectForRedis(poolToSell, timestamp);
    if (count === 2) data = getObjectForRedis(stablePool, timestamp);

    await hmsetAsync(key, data);
    await expire({ key, seconds: TWO_DAYS_IN_SECONDS });
  }
};
