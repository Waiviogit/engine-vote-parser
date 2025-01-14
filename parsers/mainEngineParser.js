const { ENGINE_CONTRACTS } = require('constants/hiveEngine');
const _ = require('lodash');
const airdropHistoryParser = require('./airdropHistoryParser');
const swapHistoryParser = require('./swapHistoryParser');
const tokensParser = require('./tokensParser');
const hiveEngineVoteParser = require('./hiveEngineVoteParser');
const marketParser = require('./marketParser');

const filterVotesCB = (vote) => vote.contract === ENGINE_CONTRACTS.COMMENTS;

const handler = {
  [ENGINE_CONTRACTS.AIRDROPS]: airdropHistoryParser.parse,
  [ENGINE_CONTRACTS.MARKETPOOLS]: swapHistoryParser.parse,
  [ENGINE_CONTRACTS.TOKENS]: tokensParser.parse,
  [ENGINE_CONTRACTS.MARKET]: marketParser.parse,
  default: async () => {
  },
};

exports.engineSwitcher = async ({
  transactions, blockNumber, timestamp, refHiveBlockNumber,
}) => {
  for (const transaction of transactions) {
    await (handler[transaction.contract] || handler.default)(transaction, blockNumber, timestamp);
  }

  await hiveEngineVoteParser.parse({
    transactions: _.filter(transactions, (vote) => filterVotesCB(vote)),
    blockNumber,
    timestamp,
    refHiveBlockNumber,
  });
};
