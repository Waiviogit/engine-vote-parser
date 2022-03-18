const cron = require('cron');
const bookEmttter = require('utilities/bookBot/bookEvents');
const { BOOK_BOTS } = require('constants/bookBot');
const { sendBotRCNotification } = require('utilities/telegramApi/telegramApiRequsts');
const bookBot = require('utilities/bookBot/bookBot');
const { BOOK_EMITTER_EVENTS } = require('../constants/bookBot');

exports.botRcEmmiterUpdate = cron.job('30 */1 * * *', async () => {
  bookEmttter.removeListener(BOOK_EMITTER_EVENTS.RC, sendBotRCNotification);

  bookEmttter.once(BOOK_EMITTER_EVENTS.RC, sendBotRCNotification);
}, null, false, null, null, false);

exports.checkBook = cron.job('*/1 * * * *', async () => {
  if (process.env.NODE_ENV !== 'staging') return;
  for (const bot of BOOK_BOTS) {
    await bookBot.sendBookEvent({ symbol: bot.symbol });
  }
}, null, false, null, null, true);
