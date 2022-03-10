const cron = require('cron');
const bookEmttter = require('utilities/bookBot/bookEvents');
const { BOOK_BOTS } = require('constants/bookBot');
const { sendBotRCNotification } = require('utilities/telegramApi/telegramApiRequsts');
const bookBot = require('utilities/bookBot/bookBot');

exports.botRcEmmiterUpdate = cron.job('30 */1 * * *', async () => {
  bookEmttter.once('bot-rc', sendBotRCNotification);
}, null, false, null, null, false);

exports.checkBook = cron.job('*/1 * * * *', async () => {
  if (process.env.NODE_ENV !== 'staging') return;
  for (const bot of BOOK_BOTS) {
    await bookBot.sendBookEvent({ symbol: bot.symbol });
  }
}, null, false, null, null, true);
