const { SUPPORTED_CURRENCIES } = require('./common');

exports.SUPPORTED_CRYPTO_CURRENCIES = {
  WAIV: 'WAIV',
  HIVE: 'HIVE',
};

exports.RATE_HIVE_ENGINE = [
  this.SUPPORTED_CRYPTO_CURRENCIES.HIVE,
  SUPPORTED_CURRENCIES.USD,
];

exports.STATISTIC_RECORD_TYPES = {
  ORDINARY: 'ordinaryData',
  DAILY: 'dailyData',
};

exports.ALLOWED_CURRENCIES = ['usd', 'btc'];

exports.ALLOWED_IDS = ['hive', 'hive_dollar'];

exports.DEFAULT_TOKEN_PRICES = {
  WAIV: 0.0008014,
};
