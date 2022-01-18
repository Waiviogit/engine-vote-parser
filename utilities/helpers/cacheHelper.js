const commentContract = require('utilities/hiveEngine/commentContract');
const { hmsetAsync, setQuotePrice } = require('utilities/redis/redisSetter');
const {
  CACHE_POOL_KEY, ENGINE_TOKENS,
  CACHE_KEY, CACH_QUOTE_PRICE_KEY,
} = require('constants/hiveEngine');
const _ = require('lodash');
const marketPools = require('../hiveEngine/marketPools');

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
exports.cachQuotePrice = async () => {
  const res = await marketPools.getMarketPools({ query: { _id: CACHE_KEY.HIVE_POOL_ID } });
  const data = _.get(res, '[0].quotePrice');
  if (!data) return;
  await setQuotePrice({ key: CACH_QUOTE_PRICE_KEY, data });
};
