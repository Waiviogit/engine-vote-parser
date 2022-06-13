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

exports.DATE_STRINGS_TO_SET_DATA = [
  '2021-09-30',
  '2021-10-01',
  '2021-10-02',
  '2021-10-03',
  '2021-10-04',
  '2021-10-05',
  '2021-10-06',
  '2021-10-07',
  '2021-10-08',
  '2021-10-09',
  '2021-10-10',
  '2021-10-11',
  '2021-10-12',
  '2021-10-13',
];
