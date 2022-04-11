const swapHistoryParser = require('parsers/swapHistoryParser');
const { ENGINE_CONTRACTS } = require('constants/hiveEngine');

exports.helper = async (transactions, blockNumber, timestamps) => {
  for (const transaction of transactions) {
    if (transaction.contract !== ENGINE_CONTRACTS.MARKETPOOLS) continue;
    await swapHistoryParser.parse(transaction, blockNumber, timestamps);
  }

  const totalParse = +process.argv[4] - +process.argv[3];
  const alreadyParsed = +process.argv[4] - blockNumber;
  const completed = (alreadyParsed * 100) / totalParse;
  console.info(`completed: ${completed}%`);
};
