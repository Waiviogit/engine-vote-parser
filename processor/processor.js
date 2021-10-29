const { parseSwitcher } = require('parsers/mainParser');
const { api } = require('api');

exports.runStream = async () => {
  try {
    const transactionStatus = await api.getBlockNumberStream({
      // # param to start parse data from latest block in blockchain
      // # if set to "false" - parsing started from last_block_num(key in redis)
      startFromCurrent: false,
      transactionsParserCallback: parseSwitcher,
      key: 'last_block_vote_engine'
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

