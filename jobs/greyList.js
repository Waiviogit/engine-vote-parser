const _ = require('lodash');
const { TOKEN_WAIV } = require('constants/hiveEngine');
const { sumBy } = require('utilities/helpers/calcHelper');
const redisSetter = require('utilities/redis/redisSetter');
const redisGetter = require('utilities/redis/redisGetter');
const { GREY_LIST_KEY, GREY_LIST_JOB_KEY } = require('constants/common');
const axios = require('axios');
const cron = require('cron');

const getAccountHistory = async (params) => {
  try {
    const result = await axios.get('https://accounts.hive-engine.com/accountHistory', { params });
    return { history: _.get(result, 'data', []) };
  } catch (error) {
    return { error };
  }
};

const getMarketSoldRatio = async (user) => {
  const { history, error } = await getAccountHistory({
    symbol: TOKEN_WAIV.SYMBOL,
    account: user,
    ops: 'market_buy,market_sell',
  });

  if (_.isEmpty(history) || error) return 0;

  const boughtAmount = sumBy(
    _.filter(history, (h) => h.operation === 'market_buy'),
    (h) => _.get(h, 'quantityTokens', 0),
  );
  const soldAmount = sumBy(
    _.filter(history, (h) => h.operation === 'market_sell'),
    (h) => _.get(h, 'quantityTokens', 0),
  );
  if (soldAmount === 0) return 0;

  const soldRatio = boughtAmount
    ? soldAmount / boughtAmount
    : soldAmount;

  return soldRatio;
};

const greyListTask = async () => {
  const users = await redisGetter.smembers(GREY_LIST_JOB_KEY);

  for (const user of users) {
    await redisSetter.srem(GREY_LIST_JOB_KEY, user);

    const marketSoldRatio = await getMarketSoldRatio(user);
    if (marketSoldRatio >= 2) {
      console.log(`${user} was added to grey list`);
      await redisSetter.sadd(GREY_LIST_KEY, user);
    }
    // here we can add check with swap pools
  }
};

const job = cron.job('00 02 * * *', async () => {
  if (process.env.NODE_ENV !== 'production') return;
  await greyListTask();
}, null, false, null, null, false);

module.exports = job;
