const tokensContract = require('utilities/hiveEngine/tokensContract');
const { sumBy } = require('utilities/helpers/calcHelper');
const { TOKEN_WAIV } = require('constants/hiveEngine');
const { GREY_LIST_KEY } = require('constants/common');
const redisSetter = require('utilities/redis/redisSetter');
const axios = require('axios');
const _ = require('lodash');

const getAccountHistory = async (params) => {
  try {
    const result = await axios.get('https://accounts.hive-engine.com/accountHistory', { params });
    return { history: _.get(result, 'data', []) };
  } catch (error) {
    return { error };
  }
};
let totalUsers = 0;

const addToGreyList = async () => {
  let offset = 0;
  const limit = 1000;
  while (true) {
    const users = await tokensContract.getTokenBalances({
      query: { symbol: TOKEN_WAIV.SYMBOL },
      limit,
      offset,
    });
    totalUsers += users.length;
    console.log(totalUsers);
    for (const user of users) {
      const { account, balance, stake } = user;
      if (Number(balance) === 0 && Number(stake) === 10) continue;
      if (Number(balance) === 0 && Number(stake) === 0) {
        console.log(`${account} was added to grey list`);
        await redisSetter.sadd(GREY_LIST_KEY, account);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      const { history, error } = await getAccountHistory({
        symbol: TOKEN_WAIV.SYMBOL,
        account,
        ops: 'market_buy,market_sell',
      });
      if (_.isEmpty(history) || error) continue;
      const boughtAmount = sumBy(
        _.filter(history, (h) => h.operation === 'market_buy'),
        (h) => _.get(h, 'quantityTokens', 0),
      );
      const soldAmount = sumBy(
        _.filter(history, (h) => h.operation === 'market_sell'),
        (h) => _.get(h, 'quantityTokens', 0),
      );
      if (soldAmount === 0) continue;
      const soldRatio = boughtAmount
        ? soldAmount / boughtAmount
        : soldAmount;
      if (soldRatio < 2) continue;
      console.log(`${account} was added to grey list`);
      await redisSetter.sadd(GREY_LIST_KEY, account);
    }
    offset += limit;
    if (users.length < limit) break;
  }
};

(async () => {
  await addToGreyList();
  process.exit();
})();
