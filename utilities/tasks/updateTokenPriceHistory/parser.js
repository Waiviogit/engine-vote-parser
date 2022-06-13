const _ = require('lodash');
const BigNumber = require('bignumber.js');
const {
  ENGINE_CONTRACTS,
  MARKET_CONTRACT,
} = require('../../../constants/hiveEngine');
const { parseJson } = require('../../helpers/jsonHelper');
const {
  delKey,
  zadd,
} = require('../../redis/redisSetter');
const { lastBlockClient } = require('../../redis/redis');
const {
  zrangebyscore,
} = require('../../redis/redisGetter');
const { saveDataInDB } = require('./helpers/saveDataInDBHelper');

const tokenPriceSwitcher = async (transactions, blockNumber, timestamps) => {
  const date = timestamps.split('T')[0];
  console.log('blockNumber', blockNumber);
  console.log('timestamps', timestamps);
  const allTimestamps = await zrangebyscore({ key: 'all_timestamps' });
  if (!allTimestamps.length) await zadd({ key: 'all_timestamps', value: date });
  else if (!_.includes(allTimestamps, date)) {
    const data = await zrangebyscore({ key: allTimestamps[allTimestamps.length - 1] });
    if (data.length) {
      const averagePrice = await handlePreviousDayData(
        allTimestamps[allTimestamps.length - 1],
        _.map(data, (el) => parseJson(el)),
      );
      await saveDataInDB({
        price: averagePrice,
        currentDate: allTimestamps[allTimestamps.length - 1],
      });
    } else {
      await saveDataInDB({
        currentDate: allTimestamps[allTimestamps.length - 1],
        previousDate: allTimestamps[allTimestamps.length - 2],
      });
    }

    await zadd({ key: 'all_timestamps', value: date });
  }

  const marketTransactions = _.filter(transactions,
    (transaction) => transaction.contract === ENGINE_CONTRACTS.MARKET
      && (transaction.action === MARKET_CONTRACT.BUY
        || transaction.action === MARKET_CONTRACT.SELL));
  if (!marketTransactions.length) return;

  for (const transaction of marketTransactions) {
    const logs = parseJson(transaction.logs);
    const payload = parseJson(transaction.payload);
    if (_.get(logs, 'errors') || _.get(payload, 'symbol') !== process.argv[5]) return;
    const {
      quantity,
      price,
    } = payload;
    await zadd({
      key: date,
      value: JSON.stringify({
        quantity,
        price,
      }),
    });
    console.log('transaction', transaction);
  }
};

const getTokenPrice = (data) => {
  const dataToAdd = _.map(data, (el) => BigNumber(el.price).multipliedBy(el.quantity).toFixed());
  const averagePrice = BigNumber(_.reduce(dataToAdd, (acc, el) => {
    if (!el) return acc;

    acc = BigNumber(acc).plus(el);

    return acc;
  }, new BigNumber(0))).dividedBy(data.length).toFixed(8, BigNumber.ROUND_UP);

  return BigNumber(averagePrice).dividedBy(_.reduce(data, (acc, el) => {
    if (!el) return acc;

    acc = BigNumber(acc).plus(el.quantity);

    return acc;
  }, new BigNumber(0))).toFixed(8, BigNumber.ROUND_UP);
};

const handlePreviousDayData = async (date, data) => {
  const averagePrice = getTokenPrice(data);
  await delKey(date, lastBlockClient);

  return averagePrice;
};

module.exports = { tokenPriceSwitcher };
