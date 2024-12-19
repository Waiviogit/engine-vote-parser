const hiveEngineVoteParser = require('parsers/hiveEngineVoteParser');

exports.parse = async (transactions, blockNumber, timestamp) => {
  const { votes } = hiveEngineVoteParser
    .formatVotesAndRewards({ transactions, blockNumber, timestamp });
  await hiveEngineVoteParser.parseEngineVotes(votes);
};
