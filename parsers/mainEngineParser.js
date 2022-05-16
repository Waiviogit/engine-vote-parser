const { ENGINE_CONTRACTS, ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const _ = require('lodash');
const airdropHistoryParser = require('./airdropHistoryParser');
const swapHistoryParser = require('./swapHistoryParser');
const tokensParser = require('./tokensParser');
const hiveEngineVoteParser = require('./hiveEngineVoteParser');
const bookParser = require('./bookParser');

exports.engineSwitcher = async (transactions, blockNumber, timestamps) => {
  //await poolsParser.parse({ transactions });

  for (const transaction of transactions) {
    await parseTransaction({
      contract: transaction.contract,
      transaction,
      blockNumber,
      timestamps,
    });
  }

  await hiveEngineVoteParser.parse({
    transactions: _.filter(transactions, (vote) => filterVotesCB(vote)),
    blockNumber,
    timestamps,
  });
  await bookParser.parse({ transactions });
};

const parseTransaction = ({
  contract, transaction, blockNumber, timestamps,
}) => {
  const handler = {
    [ENGINE_CONTRACTS.AIRDROPS]: async () => airdropHistoryParser.parse(transaction, blockNumber, timestamps),
    [ENGINE_CONTRACTS.MARKETPOOLS]: async () => swapHistoryParser.parse(transaction, blockNumber, timestamps),
    [ENGINE_CONTRACTS.TOKENS]: async () => tokensParser.parse(transaction, blockNumber, timestamps),
    default: () => '',
  };
  return (handler[contract] || handler.default)();
};

const filterVotesCB = (vote) => vote.contract === ENGINE_CONTRACTS.COMMENTS;
