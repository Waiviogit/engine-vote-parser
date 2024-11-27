const hiveEngineVoteParser = require('parsers/hiveEngineVoteParser');

exports.parse = async (transactions, blockNumber, timestamp) => {
  const { rewards } = hiveEngineVoteParser
    .formatVotesAndRewards({ transactions, blockNumber, timestamp });
  await hiveEngineVoteParser.processRewards(rewards);
};
