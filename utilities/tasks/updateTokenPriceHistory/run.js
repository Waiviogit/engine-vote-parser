const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');
const { tokenPriceSwitcher } = require('./parser');
const { delKey } = require('../../redis/redisSetter');
const { lastBlockClient } = require('../../redis/redis');

(async () => {
  await runCustomStream(
    {
      startBlock: +process.argv[3],
      finishBlock: +process.argv[4],
      key: process.argv[2],
      api,
      callback: tokenPriceSwitcher,
    },
  );
  await delKey('all_timestamps', lastBlockClient);
  await delKey(process.argv[2], lastBlockClient);
  process.exit();
})();
