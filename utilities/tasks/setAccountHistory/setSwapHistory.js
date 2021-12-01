const swapHistoryParser = require('parsers/swapHistoryParser');
const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: 58714947,
      finishBlock: 58714999,
      callback: swapHistoryParser.parse,
      api,
    },
  );
  process.exit();
})();
