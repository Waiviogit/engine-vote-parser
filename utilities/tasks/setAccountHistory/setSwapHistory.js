const swapHistoryParser = require('parsers/swapHistoryParser');
const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: process.argv[3],
      finishBlock: process.argv[4],
      callback: swapHistoryParser.parse,
      api,
    },
  );
  process.exit();
})();
