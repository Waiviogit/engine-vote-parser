const _ = require('lodash');
const BigNumber = require('bignumber.js');
const {
  CurrenciesStatistics,
  HiveEngineRate,
} = require('../models');
const {
  STATISTIC_RECORD_TYPES,
  DEFAULT_TOKEN_PRICES,
} = require('../../../../constants/currencyData');

exports.saveDataInDB = async ({ price, currentDate, previousDate }) => {
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
