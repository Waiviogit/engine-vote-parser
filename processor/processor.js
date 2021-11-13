const { parseSwitcher } = require('parsers/mainParser');
const { engineSwitcher } = require('parsers/mainEngineParser');
const { api, apiEngine } = require('api');

exports.runStream = async () => {
  try {
    const transactionStatus = await api.getBlockNumberStream({
      // # param to start parse data from latest block in blockchain
      // # if set to "false" - parsing started from last_block_num(key in redis)
      startFromCurrent: false,
      transactionsParserCallback: parseSwitcher,
      key: 'last_block_vote_engine',
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

exports.runEngineStream = async () => {
  try {
    const transactionStatus = await apiEngine.getBlockNumberStream({
      // # param to start parse data from latest block in blockchain
      // # if set to "false" - parsing started from last_block_num(key in redis)
      startFromCurrent: false,
      transactionsParserCallback: engineSwitcher,
      key: 'engine_last_block',
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
