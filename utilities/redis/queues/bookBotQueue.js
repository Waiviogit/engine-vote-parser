const { BOOK_QUEUE } = require('constants/bookBot');
const jsonHelper = require('utilities/helpers/jsonHelper');
const RedisSMQWorker = require('rsmq-worker');
const bookBot = require('utilities/bookBot/bookBot');
const config = require('config');
const _ = require('lodash');

const bookBotQueue = new RedisSMQWorker(
  BOOK_QUEUE,
  {
    options: { db: config.redis.actionsQueue },
    autostart: true,
  },
);

bookBotQueue.messageHandler = async (msg, next, id) => {
  const message = jsonHelper.parseJson(msg);
  if (_.isEmpty(message)) {
    await bookBotQueue.del(id);
    return;
  }
  await bookBot.sendBookEvent(message);
  await bookBotQueue.del(id);
  next();
};

bookBotQueue.on('message', bookBotQueue.messageHandler);

module.exports = bookBotQueue;
