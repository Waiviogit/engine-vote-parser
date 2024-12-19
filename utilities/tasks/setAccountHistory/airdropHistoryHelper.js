const airdropHistoryParser = require('parsers/airdropHistoryParser');
const { ENGINE_CONTRACTS } = require('constants/hiveEngine');

exports.helper = async (transactions, blockNumber, timestamp) => {
  for (const transaction of transactions) {
    if (transaction.contract !== ENGINE_CONTRACTS.AIRDROPS) continue;
    await airdropHistoryParser.parse(transaction, blockNumber, timestamp);
  }
};
