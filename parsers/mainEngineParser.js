const { ENGINE_CONTRACTS, ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const _ = require('lodash');
const airdropHistoryParser = require('./airdropHistoryParser');
const swapHistoryParser = require('./swapHistoryParser');
const tokensParser = require('./tokensParser');
const hiveEngineVoteParser = require('./hiveEngineVoteParser');
const marketParser = require('./marketParser');
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

const contractHandler = {
  [ENGINE_CONTRACTS.AIRDROPS]: airdropHistoryParser.parse,
  [ENGINE_CONTRACTS.MARKETPOOLS]: swapHistoryParser.parse,
  [ENGINE_CONTRACTS.TOKENS]: tokensParser.parse,
  [ENGINE_CONTRACTS.MARKET]: marketParser.parse,
  default: async () => {
  },
};

const parseTransaction = async ({
  contract, transaction, blockNumber, timestamp,
}) => {
  await (contractHandler[contract] || contractHandler.default)(transaction, blockNumber, timestamp);
};

const filterVotesCB = (vote) => vote.contract === ENGINE_CONTRACTS.COMMENTS;
