const cacheHelper = require('utilities/bookBot/helpers/cacheHelper');
const cron = require('cron');

exports.cachePoolState = cron.job('*/1 * * * *', async () => {
  await cacheHelper.cachePoolState();
}, null, false, null, null, true);

exports.cacheMarketPool = cron.job('*/1 * * * *', async () => {
  await cacheHelper.cacheMarketPool();
}, null, false, null, null, true);
