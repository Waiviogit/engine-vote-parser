const hiveEngineVoteParser = require('parsers/hiveEngineVoteParser');

exports.parse = async (transactions, blockNumber, timestamps) => {
  const { votes } = hiveEngineVoteParser
    .formatVotesAndRewards({ transactions, blockNumber, timestamps });
  await hiveEngineVoteParser.parseEngineVotes(votes);
};
