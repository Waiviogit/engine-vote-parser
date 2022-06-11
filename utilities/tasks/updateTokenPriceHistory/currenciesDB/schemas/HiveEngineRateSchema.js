const mongoose = require('mongoose');
const _ = require('lodash');
const {
  RATE_HIVE_ENGINE,
  STATISTIC_RECORD_TYPES,
} = require('../../../../../constants/currencyData');
const { TOKEN_WAIV } = require('../../../../../constants/hiveEngine');

const rates = () => _.reduce(
  RATE_HIVE_ENGINE,
  (acc, el) => {
    acc.rates[el] = { type: Number, required: true };
    acc.change24h[el] = { type: Number };
    return acc;
  },
  {
    dateString: { type: String, index: true },
    base: {
      type: String, default: TOKEN_WAIV.SYMBOL, valid: TOKEN_WAIV.SYMBOL,
    },
    type: {
      type: String,
      default: STATISTIC_RECORD_TYPES.ORDINARY,
      valid: Object.values(STATISTIC_RECORD_TYPES),
      index: true,
    },
    rates: {},
    change24h: {},
  },
);
const HiveEngineRateSchema = new mongoose.Schema(rates(), { versionKey: false });

const HiveEngineRateModel = mongoose.model('HiveEngineRate', HiveEngineRateSchema, 'hive-engine-rates');

module.exports = HiveEngineRateModel;
