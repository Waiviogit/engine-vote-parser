const { redisGetter } = require('utilities/redis');

exports.runCustomStream = async ({
  key, startBlock, finishBlock, callback, api,
}) => {
  try {
    if (!startBlock) {
      startBlock = await redisGetter.getLastBlockNum(key);
    }
    console.log(`START_FROM_BLOCK: ${startBlock}`);
    const transactionStatus = await api.getBlockNumberStream({
      startFromBlock: startBlock,
      startFromCurrent: false,
      key,
      finishBlock,
      transactionsParserCallback: callback,
    });

    if (!transactionStatus) {
      console.log('Data is incorrect or stream is already started!');
    } else {
      console.log('Stream started!');
    }
  } catch (e) {
    console.error(e);
  }
};
