const { lastBlockClient } = require('utilities/redis/redis');
const { CACHE_POOL_KEY, CACH_QUOTE_PRICE_KEY } = require('constants/hiveEngine');
const { CACHE_KEY } = require('constants/hiveConstants');
const { redisGetter } = require('../redis');

module.exports = async (waivExpertise, symbol) => {
  symbol = symbol.replace('expertise', '');
  const {
    recent_claims,
    reward_balance,
  } = await redisGetter.getHashAll(CACHE_KEY.REWARD_FUND, lastBlockClient);
  const { base } = await redisGetter.getHashAll(CACHE_KEY.CURRENT_PRICE_INFO, lastBlockClient);
  const { rewards } = await redisGetter.getHashAll(`${CACHE_POOL_KEY}:${symbol}`, lastBlockClient);
  const data = await redisGetter.getHashAll(CACH_QUOTE_PRICE_KEY, lastBlockClient);
  const quotePrice = data[symbol];

  const price = parseFloat(quotePrice) * parseFloat(base.replace(' HBD', ''));

  return (waivExpertise * price * rewards * recent_claims) / (reward_balance.replace(' HIVE', '') * base.replace(' HBD', '') * 1000000);
};
