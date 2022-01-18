const { lastBlockClient } = require('utilities/redis/redis');
const {
  CACHE_POOL_KEY, CACHE_KEY, TOKEN_WAIV, CACH_QUOTE_PRICE_KEY,
} = require('constants/hiveEngine');
const _ = require('lodash');
const { redisGetter } = require('../redis');

module.exports = async (waivExpertise, generalWAIV) => {
  waivExpertise += generalWAIV;
  const { recent_claims, reward_balance } = await redisGetter.getRewardFound(CACHE_KEY.REWARD_FUND, lastBlockClient);
  const { base } = await redisGetter.getRewardFound(CACHE_KEY.CURRENT_PRICE_INFO, lastBlockClient);
  const { rewards } = await redisGetter.getHashAll(`${CACHE_POOL_KEY}:${TOKEN_WAIV.SYMBOL}`, lastBlockClient);
  const quotePrice = await redisGetter.getQuotePrice(CACH_QUOTE_PRICE_KEY);

  const price = parseFloat(quotePrice) * parseFloat(base.replace(' HBD', ''));

  return { weight: (waivExpertise * price * rewards * recent_claims) / (reward_balance.replace(' HIVE', '') * base.replace(' HBD', '') * 1000000) };
};
