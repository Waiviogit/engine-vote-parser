const { ENGINE_CONTRACTS, ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const _ = require('lodash');
const airdropHistoryParser = require('./airdropHistoryParser');
const swapHistoryParser = require('./swapHistoryParser');
const tokensParser = require('./tokensParser');
const hiveEngineVoteParser = require('./hiveEngineVoteParser');
const bookParser = require('./bookParser');

exports.engineSwitcher = async ({
  transactions, blockNumber, timestamp, refHiveBlockNumber,
}) => {
  // await poolsParser.parse({ transactions });

  for (const transaction of transactions) {
    await parseTransaction({
      contract: transaction.contract,
      transaction,
      blockNumber,
      timestamp,
    });
  }

  await hiveEngineVoteParser.parse({
    transactions: _.filter(transactions, (vote) => filterVotesCB(vote)),
    blockNumber,
    timestamp,
    refHiveBlockNumber,
  });
  // await bookParser.parse({ transactions });
};

const parseTransaction = ({
  contract, transaction, blockNumber, timestamp,
}) => {
  const handler = {
    [ENGINE_CONTRACTS.AIRDROPS]: async () => airdropHistoryParser.parse(transaction, blockNumber, timestamp),
    [ENGINE_CONTRACTS.MARKETPOOLS]: async () => swapHistoryParser.parse(transaction, blockNumber, timestamp),
    [ENGINE_CONTRACTS.TOKENS]: async () => tokensParser.parse(transaction, blockNumber, timestamp),
    default: () => '',
  };
  return (handler[contract] || handler.default)();
};

const filterVotesCB = (vote) => vote.contract === ENGINE_CONTRACTS.COMMENTS;
