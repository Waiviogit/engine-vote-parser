const commentContract = require('utilities/hiveEngine/commentContract');
const { redisSetter, redisGetter, redis } = require('utilities/redis');
const {
  CACHE_POOL_KEY, ENGINE_TOKENS,
  CACH_MARKET_POOL_KEY,
} = require('constants/hiveEngine');

const _ = require('lodash');
const jsonHelper = require('utilities/helpers/jsonHelper');
const marketPools = require('../hiveEngine/marketPools');

exports.cachePoolState = async () => {
  for (const TOKEN of ENGINE_TOKENS) {
    const pool = await commentContract.getRewardPools({ query: { _id: TOKEN.POOL_ID } });
    if (_.isEmpty(pool)) continue;
    if (_.has(pool, 'error')) continue;
    const { rewardPool, pendingClaims } = pool[0];
    const rewards = parseFloat(rewardPool) / parseFloat(pendingClaims);
    await redisSetter.hmsetAsync(
      `${CACHE_POOL_KEY}:${TOKEN.SYMBOL}`,
      { rewardPool, pendingClaims, rewards },
    );
  }
};

exports.cacheMarketPool = async () => {
  for (const TOKEN of ENGINE_TOKENS) {
    const marketPool = await marketPools.getMarketPools({ query: { _id: TOKEN.MARKET_POOL_ID } });
    if (_.isEmpty(marketPool)) continue;
    if (_.has(marketPool, 'error')) continue;
    await redisSetter.hmsetAsync(
      `${CACH_MARKET_POOL_KEY}:${TOKEN.SYMBOL}`,
      marketPool[0],
    );
  }
};

const getCachedData = async (key) => redisGetter.getAsync({
  key,
  client: redis.mainFeedsCacheClient,
});

const setCachedData = async ({
  key,
  data,
  ttl,
}) => {
  await redisSetter.setEx({
    key, value: JSON.stringify(data), ttlSeconds: ttl, client: redis.mainFeedsCacheClient,
  });
};

exports.cacheWrapper = (fn) => (...args) => async ({ key, ttl }) => {
  const cache = await getCachedData(key);
  if (cache) {
    const parsed = jsonHelper.parseJson(cache, null);
    if (parsed) return parsed;
  }
  const result = await fn(...args);

  if (!result?.error) {
    await setCachedData({ key, data: result, ttl });
  }
  return result;
};
