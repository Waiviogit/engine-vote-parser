const mongoose = require('mongoose');
const {
  ALLOWED_CURRENCIES,
  ALLOWED_IDS,
} = require('../../../../../constants/currencyData');

const currency = () => {
  const data = {};
  for (const curr of ALLOWED_CURRENCIES) {
    data[curr] = { type: Number, required: true };
    data[`${curr}_24h_change`] = { type: Number, required: true };
  }
  return data;
};

const currencySchema = new mongoose.Schema(currency(), { _id: false });

const statistic = () => {
  const data = {};
  for (const id of ALLOWED_IDS) {
    data[id] = { type: currencySchema, required: true };
  }
  data.type = {
    type: String, default: 'ordinaryData', valid: ['ordinaryData', 'dailyData'], index: true,
  };
  return data;
};

const currenciesStatisticSchema = new mongoose.Schema(statistic(), { timestamps: true });

currenciesStatisticSchema.index({ createdAt: 1 });

const currenciesSchema = mongoose.model('CurrenciesStatistic', currenciesStatisticSchema, 'currencies-statistics');

module.exports = currenciesSchema;
