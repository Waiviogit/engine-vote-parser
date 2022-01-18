const cacheHelper = require('utilities/helpers/cacheHelper');
const cron = require('cron');

exports.cachePoolState = cron.job('*/1 * * * *', async () => {
  await cacheHelper.cachePoolState();
  await cacheHelper.cachQuotePrice();
}, null, false, null, null, true);
