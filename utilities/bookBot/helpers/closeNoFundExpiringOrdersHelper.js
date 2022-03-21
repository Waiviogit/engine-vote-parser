const _ = require('lodash');
const BigNumber = require('bignumber.js');
const { REDIS_BOOK } = require('../../../constants/bookBot');
const {
  redisGetter,
  redisSetter,
} = require('../../redis');
const { expiredPostsClient } = require('../../redis/redis');
const { getCancelParams } = require('../bookHelpers');

exports.closeNoFundOrExpiringOrders = async ({
  positions = [], type, book, bookBot,
}) => {
  const operations = [];
  const redisPositions = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${REDIS_BOOK.POSITIONS}`;
  const currentPositions = await redisGetter.smembers(redisPositions);
  const diff = _.difference(currentPositions, positions);
  if (_.isEmpty(diff)) return operations;

  for (const diffElement of diff) {
    const redisKey = `${REDIS_BOOK.MAIN}:${type}:${bookBot.symbol}:${bookBot.account}:${diffElement}`;
    const orderCache = await redisGetter.getHashAll(redisKey, expiredPostsClient);
    const orderInBook = _.find(book,
      (order) => order.account === bookBot.account && BigNumber(order.price).eq(orderCache.price));
    if (orderInBook) {
      operations.push(getCancelParams({
        id: _.get(orderInBook, 'txId'),
        type,
      }));
    }
    await redisSetter.delKey(redisKey);
    await redisSetter.srem(redisPositions, diffElement);
  }

  return operations;
};
