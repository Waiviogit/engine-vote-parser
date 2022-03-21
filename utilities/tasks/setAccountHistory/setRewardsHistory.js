const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/bookBot/helpers/customStreamHelper');
const setRewardsHelper = require('./setRewardsHelper');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: +process.argv[3],
      finishBlock: +process.argv[4],
      callback: setRewardsHelper.parse,
      api,
    },
  );
  process.exit();
})();
