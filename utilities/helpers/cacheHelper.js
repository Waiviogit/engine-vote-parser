const commentContract = require('utilities/hiveEngine/commentContract');
const { hmsetAsync } = require('utilities/redis/redisSetter');
const {
  CACHE_POOL_KEY, ENGINE_TOKENS,
  CACH_MARKET_POOL_KEY,
} = require('constants/hiveEngine');

const _ = require('lodash');
const marketPools = require('../hiveEngine/marketPools');

exports.cachePoolState = async () => {
  for (const TOKEN of ENGINE_TOKENS) {
    const pool = await commentContract.getRewardPools({ query: { _id: TOKEN.POOL_ID } });
    if (_.isEmpty(pool)) continue;
    const { rewardPool, pendingClaims } = pool[0];
    const rewards = parseFloat(rewardPool) / parseFloat(pendingClaims);
    await hmsetAsync(
      `${CACHE_POOL_KEY}:${TOKEN.SYMBOL}`,
      { rewardPool, pendingClaims, rewards },
    );
  }
};

exports.cacheMarketPool = async () => {
  for (const TOKEN of ENGINE_TOKENS) {
    const marketPool = await marketPools.getMarketPools({ query: { _id: TOKEN.MARKET_POOL_ID } });
    if (_.isEmpty(marketPool)) continue;
    await hmsetAsync(
      `${CACH_MARKET_POOL_KEY}:${TOKEN.SYMBOL}`,
      marketPool[0],
    );
  }
};
