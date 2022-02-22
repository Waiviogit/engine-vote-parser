const cron = require('cron');
const bookEmttter = require('utilities/bookBot/bookEvents');
const { sendBotRCNotification } = require('utilities/telegramApi/telegramApiRequsts');

exports.botRcEmmiterUpdate = cron.job('30 */1 * * *', async () => {
  bookEmttter.once('bot-rc', sendBotRCNotification);
}, null, false, null, null, false);
