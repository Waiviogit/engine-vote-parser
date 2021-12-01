const airdropHistoryParser = require('parsers/airdropHistoryParser');
const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: process.argv[3],
      finishBlock: process.argv[4],
      callback: airdropHistoryParser.parse,
      api,
    },
  );
  process.exit();
})();
