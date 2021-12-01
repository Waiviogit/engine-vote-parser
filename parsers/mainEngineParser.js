const enginePostRewardParser = require('./enginePostRewardParser');
const airdropHistoryParser = require('./airdropHistoryParser');
const swapHistoryParser = require('./swapHistoryParser');

exports.engineSwitcher = async (transactions, blockNumber, timestamps) => {
  await airdropHistoryParser.parse(transactions, blockNumber, timestamps);
  await swapHistoryParser.parse(transactions, blockNumber, timestamps);
  await enginePostRewardParser.parse(transactions);
};
