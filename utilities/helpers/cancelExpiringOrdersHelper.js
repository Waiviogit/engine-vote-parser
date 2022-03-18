const moment = require('moment');
const _ = require('lodash');
const {
  UNIX_TIMESTAMP_CONVERTER,
  REDIS_BOOK,
} = require('../../constants/bookBot');
const redisGetter = require('../redis/redisGetter');
const { expiredPostsClient } = require('../redis/redis');
const BigNumber = require('bignumber.js');
const { getCancelParams } = require('../bookBot/bookHelpers');
const redisSetter = require('../redis/redisSetter');

const checkIfOdrerExpiresTomorrow = (expirationDate) => {
  const expirationDay = moment.utc(expirationDate).date();
  const expirationMonth = moment.utc(expirationDate).add(1, 'month').month();
  const expirationYear = moment.utc(expirationDate).year();

  const currentDay = moment.utc().date();
  const currentMonth = moment.utc().month() + 1;
  const currentYear = moment.utc().year();

  const usualTommorow = currentDay + 1 === expirationDay && currentMonth === expirationMonth
    && currentYear === expirationYear;

  const newMonthTomorrow = (currentDay > expirationDay && expirationDay === 1)
    && expirationMonth === currentMonth + 1 && currentYear === expirationYear;

  const newYearTomorrow = (currentDay > expirationDay && expirationDay === 1)
    && (currentMonth > expirationMonth && expirationMonth === 1)
    && expirationYear === currentYear + 1;
  if (usualTommorow || newMonthTomorrow || newYearTomorrow) return true;

  return false;
};

const processExpiringTomorrowOrders = async ({ orders, type, bookBot }) => {
  if (!orders.length) return;

  const operations = [];
  const redisPositions = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  const currentPositions = await redisGetter.smembers(redisPositions);
  if (!currentPositions.length) return;

  for (const position of currentPositions) {
    const redisKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${position}`;
    const orderCache = await redisGetter.getHashAll(redisKey, expiredPostsClient);
    const orderInBook = _.find(orders,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(orderCache.price));
    if (orderInBook) {
      operations.push(getCancelParams({
        id: _.get(orderInBook, 'txId'),
        type,
      }));
    }
    await redisSetter.delKey(redisKey);
    await redisSetter.srem(redisPositions, position);
  }
};

exports.handleOrders = async ({ book, type, bookBot }) => {
  const ordersExpiringTomorrow = book.filter((order) => checkIfOdrerExpiresTomorrow(
    order.expiration * UNIX_TIMESTAMP_CONVERTER,
  ));
  if (ordersExpiringTomorrow.length) {
    await processExpiringTomorrowOrders({
      orders: ordersExpiringTomorrow,
      type,
      bookBot,
    });
  }
};
