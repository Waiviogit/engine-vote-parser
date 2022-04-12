const { User } = require('models');
const { tokensContract } = require('utilities/hiveEngine');
const _ = require('lodash');
const axios = require('axios');
const { EngineAccountHistory } = require('models');
const { ObjectId } = require('mongoose').Types;
const redisGetter = require('utilities/redis/redisGetter');
const redisSetter = require('utilities/redis/redisSetter');

const redisKey = 'errored_swap_task';

const swapRequest = async (name, page) => {
  try {
    const result = await axios.get(`https://info-api.tribaldex.com/@${name}/transactions?types=SWAP&limit=1000&page=${page}`);
    return _.get(result, 'data');
  } catch (error) {
    console.error(error.message, name);
    await redisSetter.sadd(redisKey, name);
  }
};

const setSwaps = async ({ name, page }) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const response = await swapRequest(name, page);
  if (!response) return;
  if (_.isEmpty(_.get(response, 'results'))) return;
  if (!_.get(response, 'pages')) return;
  await createSwapRecord({
    records: _.get(response, 'results', []),
    account: name,
  });
  console.info(`${name} ${_.get(response, 'results.length')} swap records updated`);

  if (_.get(response, 'pages') === page) {
    return;
  }
  return setSwaps({ name, page: ++page });
};

const createSwapRecord = async ({ records, account }) => {
  for (const record of records) {
    await EngineAccountHistory.create({
      _id: new ObjectId(_.get(record, 'timestamp')),
      blockNumber: _.get(record, 'block'),
      transactionId: _.get(record, 'trx_id'),
      account,
      operation: 'marketpools_swapTokens',
      symbolOut: _.get(record, 'data.symbolOut'),
      symbolIn: _.get(record, 'data.symbolIn'),
      symbolOutQuantity: _.get(record, 'data.amountOut'),
      symbolInQuantity: _.get(record, 'data.amountIn'),
      timestamp: _.get(record, 'timestamp'),
    });
  }
};

const processErrored = async (users) => {
  for (const user of users) {
    await setSwaps({ name: user, page: 1 });
    await redisSetter.srem(redisKey, user);
  }
};

const fillAccountsSwapHistory = async () => {
  const { result: users } = await User.find({
    condition: { processed: false },
    select: { name: 1 },
    limit: 1000,
  });
  if (_.isEmpty(users)) {
    const erroredUsers = await redisGetter.smembers(redisKey);
    if (!_.isEmpty(erroredUsers)) {
      console.error(erroredUsers.length, 'users with error');
      await processErrored(erroredUsers);
    }
    console.info('-----------finished');
    process.exit();
  }

  for (const user of users) {
    await User.update({ _id: user._id }, { processed: true });
    const balances = await tokensContract.getTokenBalances({ query: { account: user.name } });
    if (_.isEmpty(balances)) continue;
    await setSwaps({ name: user.name, page: 1 });
  }
  await fillAccountsSwapHistory();
};

(async () => {
  await fillAccountsSwapHistory();
})();
