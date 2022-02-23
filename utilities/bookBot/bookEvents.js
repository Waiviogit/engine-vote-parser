const EventEmitter = require('events');
const { BOOK_EMITTER_EVENTS } = require('constants/bookBot');
const { sendBotRCNotification } = require('../telegramApi/telegramApiRequsts');

const bookEmitter = new EventEmitter();

bookEmitter.once(BOOK_EMITTER_EVENTS.RC, sendBotRCNotification);

module.exports = bookEmitter;
