const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');
const swapHistoryHelper = require('./swapHistoryHelper');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: process.argv[3],
      finishBlock: process.argv[4],
      callback: swapHistoryHelper.helper,
      api,
    },
  );
  process.exit();
})();
