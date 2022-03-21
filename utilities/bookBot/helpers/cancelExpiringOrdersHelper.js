const moment = require('moment');
const _ = require('lodash');
const BigNumber = require('bignumber.js');
const { closeNoFundOrExpiringOrders } = require('./closeNoFundExpiringOrdersHelper');
const { REDIS_BOOK } = require('../../../constants/bookBot');
const { redisGetter } = require('../../redis');
const { expiredPostsClient } = require('../../redis/redis');

exports.handleOrders = async ({ book, type, bookBot }) => {
  const ordersExpiringTomorrow = book.filter((order) => order.account === bookBot.account
    && checkIfOrderExpiresTomorrow(order.expiration));
  if (!ordersExpiringTomorrow.length) return [];

  return closeNoFundOrExpiringOrders({
    book: ordersExpiringTomorrow,
    type,
    bookBot,
    positions: findPositionsOfExpiringOrders({
      book: ordersExpiringTomorrow,
      type,
      bookBot,
    }),
  });
};

const checkIfOrderExpiresTomorrow = (expirationDate) => {
  const diffDays = moment.unix(expirationDate).diff(moment.utc(), 'days');

  return diffDays <= 1;
};

const findPositionsOfExpiringOrders = async ({ book, type, bookBot }) => {
  const positionsOfExpiringOrders = [];
  const redisPositions = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  const currentPositions = await redisGetter.smembers(redisPositions);
  for (const position of currentPositions) {
    const redisKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${position}`;
    const orderCache = await redisGetter.getHashAll(redisKey, expiredPostsClient);
    const orderInBook = _.find(book, (order) => BigNumber(order.price).eq(orderCache.price));

    /** We take reverse positions so that we can use this array in the closeNoFundOrExpiringOrders function */
    if (!orderInBook) positionsOfExpiringOrders.push(position);
  }

  return positionsOfExpiringOrders;
};
