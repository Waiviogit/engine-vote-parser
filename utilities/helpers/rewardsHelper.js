const { getCurrentPriceInfo } = require('utilities/hiveApi/hiveOperations');
const { cacheWrapper } = require('./cacheHelper');

const getCachedPriceInfo = cacheWrapper(getCurrentPriceInfo);
const CACHE_PRICE_KEY = 'cached_price_info';
const CACHE_PRICE_TTL = 60 * 5;
const cacheParams = { key: CACHE_PRICE_KEY, ttl: CACHE_PRICE_TTL };

const getRsharesFromUSD = async (usdAmount) => {
  const { currentPrice: rate, rewardFund } = await getCachedPriceInfo()(cacheParams);
  const { recent_claims: recentClaims, reward_balance: rewardBalance } = rewardFund;
  const rewardBalanceNumber = parseFloat(rewardBalance.replace(' HIVE', ''));
  return (usdAmount / (rewardBalanceNumber * rate)) * recentClaims;
};

const getWeightForFieldUpdate = async (weight) => {
  if (weight === 1) return weight;

  const rshares = await getRsharesFromUSD(weight);

  return Math.round(Number(rshares) * 1e-6);
};

module.exports = {
  getWeightForFieldUpdate,
};
