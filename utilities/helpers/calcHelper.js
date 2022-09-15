const BigNumber = require('bignumber.js');
const _ = require('lodash');

exports.sumBy = (arr, callback) => _.reduce(arr, (value, element) => (
  new BigNumber(value).plus(callback(element))), new BigNumber(0)).toNumber();

exports.add = (...args) => _.reduce(args, (value, element) => (
  new BigNumber(value).plus(element)), new BigNumber(0)).toNumber();

exports.subtract = (value1, value2) => new BigNumber(value1).minus(value2).toNumber();

exports.divide = (value1, value2, decimalPlaces = 10) => new BigNumber(value1)
  .dividedBy(value2)
  .decimalPlaces(decimalPlaces)
  .toNumber();

exports.multiply = (value1, value2, decimalPlaces = 10) => new BigNumber(value1)
  .multipliedBy(value2)
  .decimalPlaces(decimalPlaces)
  .toNumber();
