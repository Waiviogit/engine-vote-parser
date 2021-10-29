const { hiveEngineVoteParser } = require('parsers');
const { MAIN_OPS } = require('constants/parsersData');

exports.parseSwitcher = async (transactions) => {
  const votesOps = [];

  for (const transaction of transactions) {
    if (transaction && transaction.operations && transaction.operations[0]) {
      for (const operation of transaction.operations) {
        if (operation[0] === MAIN_OPS.VOTE) {
          votesOps.push(operation[1]);
        }
      }
    }
  }
  await hiveEngineVoteParser.parse(votesOps);
};
