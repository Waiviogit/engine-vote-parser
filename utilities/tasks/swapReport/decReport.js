const { EngineAccountHistory } = require('models');
const moment = require('moment');
const _ = require('lodash');
const axios = require('axios');
const BigBumber = require('bignumber.js');

const mongoose = require('mongoose');

const { Schema } = mongoose;

const ReportSchema = new Schema({
  date: { type: String },
  priceUSD: { type: String },
  priceHIVE: { type: String },
  symbol: { type: String },
}, { versionKey: false, id: false });

const reportModel = mongoose.model('DEC_REPORT', ReportSchema);

const symbol = 'DEC';

exports.createReport = async () => {
  const filter = { operation: 'marketpools_swapTokens', $or: [{ symbolIn: symbol, symbolOut: 'SWAP.HIVE' }, { symbolIn: 'SWAP.HIVE', symbolOut: symbol }] };
  const { result: startDate } = await EngineAccountHistory.findOne({ filter, options: { sort: { timestamp: 1 } } });
  let currentDayStart = moment.unix(startDate.timestamp).startOf('day').unix();
  let currentDayEnd = moment.unix(startDate.timestamp).endOf('day').unix();
  let dailyRates;
  const today = moment().startOf('day').unix();
  do {
    filter.$and = [{ timestamp: { $gt: currentDayStart } }, { timestamp: { $lt: currentDayEnd } }];
    ({ result: dailyRates } = await EngineAccountHistory.find({ filter }));
    await handleRecords(dailyRates, currentDayEnd);
    currentDayStart = moment.unix(currentDayStart).add(1, 'day').unix();
    currentDayEnd = moment.unix(currentDayEnd).add(1, 'day').unix();
  } while (today !== currentDayStart);
  console.log('COMPLETED');
};

const handleRecords = async (records, endOfTheDay) => {
  for (const record of records) {
    record.priceInHive = record.symbolIn === symbol
      ? record.symbolOutQuantity / record.symbolInQuantity
      : record.symbolInQuantity / record.symbolOutQuantity;

    record.quantity = record.symbolIn === symbol
      ? Number(record.symbolInQuantity)
      : Number(record.symbolOutQuantity);

    record.volume = record.quantity * record.priceInHive;
  }

  const sum = _.sumBy(records, 'volume');
  const quantity = _.sumBy(records, 'quantity');
  const averagePriceInHive = sum / quantity;
  const date = moment.unix(endOfTheDay).format('DD-MM-YYYY');
  const hivePriceUsd = await getHivePriceUsd(moment.unix(endOfTheDay).format('DD-MM-YYYY'));
  const priceUSD = hivePriceUsd * averagePriceInHive;
  await reportModel.create({
    date,
    priceUSD: BigBumber(priceUSD).toFixed(8),
    priceHIVE: BigBumber(averagePriceInHive).toFixed(8),
    symbol,
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('tick');
};

const getHivePriceUsd = async (date) => {
  try {
    const resp = await axios.get(`https://api.coingecko.com/api/v3/coins/hive/history?date=${date}`);
    return _.get(resp, 'data.market_data.current_price.usd');
  } catch (error) {
    console.log(error.message);
    return { error };
  }
};
