const airdropHistoryParser = require('parsers/airdropHistoryParser');
const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: 11087076,
      finishBlock: 58074258,
      callback: airdropHistoryParser.parse,
      api,
    },
  );
  process.exit();
})();
