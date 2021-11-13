const enginePostRewardParser = require('./enginePostRewardParser');

exports.engineSwitcher = async (transactions, blockNumber) => {
  await enginePostRewardParser.parse(transactions);
};
