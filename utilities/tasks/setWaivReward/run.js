const { runCustomStream } = require('utilities/helpers/customStreamHelper');
const enginePostRewardParser = require('parsers/enginePostRewardParser');
const api = require('api/hiveEngine');

(async () => {
  await runCustomStream(
    {
      key: process.argv[2],
      startBlock: +process.argv[3],
      finishBlock: +process.argv[4],
      callback: enginePostRewardParser.parse,
      api,
    },
  );
  process.exit();
})();
