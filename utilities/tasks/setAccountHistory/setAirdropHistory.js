// const airdropHistoryParser = require('parsers/airdropHistoryParser');
const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');
const airdropHistoryHelper = require('./airdropHistoryHelper');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: 11087076,
      finishBlock: 11087888,
      callback: airdropHistoryHelper.helper,
      api,
    },
  );
  process.exit();
})();
