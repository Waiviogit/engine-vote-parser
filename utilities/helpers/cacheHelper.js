const commentContract = require('utilities/hiveEngine/commentContract');
const { hmsetAsync } = require('utilities/redis/redisSetter');
const { CACHE_POOL_KEY, ENGINE_TOKENS } = require('constants/hiveEngine');

exports.cachePoolState = async () => {
  for (const TOKEN of ENGINE_TOKENS) {
    const [pool = null] = await commentContract.getRewardPools({ query: { _id: 13 } });
    if (!pool) return;
    const { rewardPool, pendingClaims } = pool;
    const rewards = parseFloat(rewardPool) / parseFloat(pendingClaims);
    await hmsetAsync(
      `${CACHE_POOL_KEY}:${TOKEN.SYMBOL}`,
      { rewardPool, pendingClaims, rewards },
    );
  }
};
