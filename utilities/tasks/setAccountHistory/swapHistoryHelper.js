const swapHistoryParser = require('parsers/swapHistoryParser');
const { ENGINE_CONTRACTS } = require('constants/hiveEngine');

exports.helper = async (transactions, blockNumber, timestamps) => {
  for (const transaction of transactions) {
    if (transaction.contract !== ENGINE_CONTRACTS.MARKETPOOLS) continue;
    await swapHistoryParser.parse(transaction, blockNumber, timestamps);
  }
};
