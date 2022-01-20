const cacheHelper = require('utilities/helpers/cacheHelper');
const cron = require('cron');

exports.cachePoolState = cron.job('*/1 * * * *', async () => {
  await cacheHelper.cachePoolState();
}, null, false, null, null, true);

exports.cachQuotePrice = cron.job('*/1 * * * *', async () => {
  await cacheHelper.cachQuotePrice();
}, null, false, null, null, true);
