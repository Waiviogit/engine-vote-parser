const EventEmitter = require('events');
const { sendBotRCNotification } = require('../telegramApi/telegramApiRequsts');

const bookEmitter = new EventEmitter();

bookEmitter.once('bot-rc', sendBotRCNotification);

module.exports = bookEmitter;
