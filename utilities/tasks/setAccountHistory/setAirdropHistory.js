const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');
const airdropHistoryHelper = require('./airdropHistoryHelper');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: process.argv[3],
      finishBlock: process.argv[4],
      callback: airdropHistoryHelper.helper,
      api,
    },
  );
  process.exit();
})();
