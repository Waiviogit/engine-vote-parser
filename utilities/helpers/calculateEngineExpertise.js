/* eslint-disable camelcase */
const { lastBlockClient } = require('utilities/redis/redis');
const {
  CACHE_POOL_KEY,
  CACH_MARKET_POOL_KEY,
} = require('constants/hiveEngine');
const { CACHE_KEY } = require('constants/hiveConstants');
const BigNumber = require('bignumber.js');
const { redisGetter } = require('../redis');



module.exports = async (expertise, symbol) => {
  const {
    recent_claims,
    reward_balance,
  } = await redisGetter.getHashAll(CACHE_KEY.REWARD_FUND, lastBlockClient);
  const { base } = await redisGetter.getHashAll(CACHE_KEY.CURRENT_PRICE_INFO, lastBlockClient);
  const { rewards } = await redisGetter.getHashAll(`${CACHE_POOL_KEY}:${symbol}`, lastBlockClient);
  const { quotePrice } = await redisGetter.getHashAll(`${CACH_MARKET_POOL_KEY}:${symbol}`, lastBlockClient);
  const price = BigNumber(parseFloat(quotePrice)).multipliedBy(parseFloat(base.replace(' HBD', ''))).toNumber();

  if (!!base.replace(' HBD', '') && !!rewards && !!quotePrice && !!recent_claims && !!reward_balance.replace(' HIVE', '')) {
    return expertise * price * rewards;
  }
  return 0;
};
