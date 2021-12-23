const hiveEngineVoteParser = require('parsers/hiveEngineVoteParser');

exports.parse = async (transactions, blockNumber, timestamps) => {
  const { rewards } = hiveEngineVoteParser
    .formatVotesAndRewards({ transactions, blockNumber, timestamps });
  await hiveEngineVoteParser.processRewards(rewards);
};
