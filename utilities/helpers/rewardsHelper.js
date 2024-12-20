const { REDIS_KEYS } = require('constants/parsersData');
const { redis, redisGetter } = require('utilities/redis');

const getRsharesFromUSD = async (usdAmount) => {
  const priceInfo = await redisGetter
    .getHashAll(REDIS_KEYS.CURRENT_PRICE_INFO, redis.lastBlockClient);

  const rewardBalanceNumber = parseFloat(priceInfo.reward_balance.replace(' HIVE', ''));
  return (usdAmount / (rewardBalanceNumber * parseFloat(priceInfo.price)))
      * parseFloat(priceInfo.recent_claims);
};

const getWeightForFieldUpdate = async (weight) => {
  if (weight === 1) return weight;

  const rshares = await getRsharesFromUSD(weight);

  return Math.round(Number(rshares) * 1e-6);
};

module.exports = {
  getWeightForFieldUpdate,
};
