const api = require('api/hiveEngine');
const { runCustomStream } = require('utilities/helpers/customStreamHelper');
const { tokenPriceSwitcher } = require('./parser');
const { delKey } = require('../../redis/redisSetter');
const { lastBlockClient } = require('../../redis/redis');
const { DATE_STRINGS_TO_SET_DATA } = require('../../../constants/currencyData');
const { saveDataInDB } = require('./helpers/saveDataInDBHelper');

(async () => {
  /** setting data before token sales started */
  for (const date of DATE_STRINGS_TO_SET_DATA) {
    await saveDataInDB({ currentDate: date });
  }

  /** parsing blocks to set data */
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
