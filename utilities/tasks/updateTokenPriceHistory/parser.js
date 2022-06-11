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
const {
  STATISTIC_RECORD_TYPES,
  DEFAULT_TOKEN_PRICES,
} = require('../../../constants/currencyData');
const {
  HiveEngineRate,
  CurrenciesStatistics,
} = require('./models');

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
  const highestPrice = _.reduce(data, (prev, current) => (BigNumber(prev.price)
    .isGreaterThan(current.price) ? prev : current));
  const lowestPrice = _.reduce(data, (prev, current) => (BigNumber(prev.price)
    .isLessThan(current.price) ? prev : current));
  const closingPrice = data[data.length - 1];

  const typicalPrice = BigNumber(BigNumber(highestPrice.price).plus(lowestPrice.price)
    .plus(closingPrice.price)).dividedBy(3).toFixed(8, BigNumber.ROUND_UP);
  const volume = BigNumber(BigNumber(highestPrice.quantity).plus(lowestPrice.quantity)
    .plus(closingPrice.quantity)).dividedBy(3).toFixed(8, BigNumber.ROUND_DOWN);
  const cumulateVolume = _.reduce(data, (acc, el) => {
    if (!el) return acc;

    acc = BigNumber(acc)
      .plus(el.quantity);

    return acc;
  }, new BigNumber(0)).toFixed();

  return BigNumber(BigNumber(typicalPrice).multipliedBy(volume)).dividedBy(cumulateVolume)
    .toFixed(8, BigNumber.ROUND_UP);
};

const handlePreviousDayData = async (date, data) => {
  const averagePrice = getTokenPrice(data);
  await delKey(date, lastBlockClient);

  return averagePrice;
};

const saveDataInDB = async ({ price, currentDate, previousDate }) => {
  console.log('currentDate', currentDate);
  console.log('previousDate', previousDate);
  const { result } = await CurrenciesStatistics.findOne({
    createdAt: { $gte: currentDate },
    type: STATISTIC_RECORD_TYPES.DAILY,
  });
  let dataToSave = {};
  if (price) {
    dataToSave = constructDataToSave({
      price,
      date: currentDate,
      hivePrice: result.hive.usd,
    });
  } else {
    const { result: savedData } = await HiveEngineRate.findOne({
      base: process.argv[5],
      type: STATISTIC_RECORD_TYPES.DAILY,
      dateString: previousDate,
    });
    if (savedData) {
      savedData.dateString = currentDate;
      dataToSave = _.omit(savedData, ['_id']);
    } else {
      dataToSave = constructDataToSave({
        priceUSD: DEFAULT_TOKEN_PRICES.WAIV,
        date: currentDate,
        hivePrice: result.hive.usd,
      });
    }
  }

  const { result: savedRate } = await HiveEngineRate.create(dataToSave);
  console.log('savedRate', savedRate);
};

const constructDataToSave = ({
  price, date, hivePrice, priceUSD,
}) => ({
  base: process.argv[5],
  type: STATISTIC_RECORD_TYPES.DAILY,
  dateString: date,
  rates: {
    HIVE: price ? Number(price) : 0,
    USD: price ? new BigNumber(price).multipliedBy(hivePrice).toFixed() : priceUSD,
  },
});

module.exports = { tokenPriceSwitcher };
