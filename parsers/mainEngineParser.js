const { ENGINE_CONTRACTS } = require('constants/hiveEngine');
const enginePostRewardParser = require('./enginePostRewardParser');
const airdropHistoryParser = require('./airdropHistoryParser');
const swapHistoryParser = require('./swapHistoryParser');
const transferParser = require('./transferParser');

exports.engineSwitcher = async (transactions, blockNumber, timestamps) => {
  for (const transaction of transactions) {
    await parseTransaction({
      contract: transaction.contract,
      transaction,
      blockNumber,
      timestamps,
    });
  }

  await enginePostRewardParser.parse(transactions);
};

const parseTransaction = ({
  contract, transaction, blockNumber, timestamps,
}) => {
  const handler = {
    [ENGINE_CONTRACTS.AIRDROPS]: async () => airdropHistoryParser.parse(transaction, blockNumber, timestamps),
    [ENGINE_CONTRACTS.MARKETPOOLS]: async () => swapHistoryParser.parse(transaction, blockNumber, timestamps),
    [ENGINE_CONTRACTS.TOKENS]: async () => transferParser.parse(transaction, blockNumber),
    default: () => '',
  };
  return (handler[contract] || handler.default)();
};
