const swapHistoryParser = require('parsers/swapHistoryParser');
const { ENGINE_CONTRACTS } = require('constants/hiveEngine');

exports.helper = async (transactions, blockNumber, timestamps) => {
  for (const transaction of transactions) {
    if (transaction.contract !== ENGINE_CONTRACTS.MARKETPOOLS) continue;
    await swapHistoryParser.parse(transaction, blockNumber, timestamps);
  }
  const uptime = process.uptime();

  const totalParse = +process.argv[4] - +process.argv[3];
  const alreadyParsed = blockNumber - +process.argv[3];
  const completed = (alreadyParsed * 100) / totalParse;
  const leftTimeSeconds = (100 * uptime) / completed;

  console.info(`completed in ${secondsToDhms(leftTimeSeconds)}`);
  console.info(`completed: ${completed}%`);
};

const secondsToDhms = (seconds) => {
  seconds = Number(seconds);
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor(seconds % (3600 * 24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);

  const dDisplay = d > 0 ? d + (d === 1 ? ' day, ' : ' days, ') : '';
  const hDisplay = h > 0 ? h + (h === 1 ? ' hour, ' : ' hours, ') : '';
  const mDisplay = m > 0 ? m + (m === 1 ? ' minute, ' : ' minutes, ') : '';
  const sDisplay = s > 0 ? s + (s === 1 ? ' second' : ' seconds') : '';

  return dDisplay + hDisplay + mDisplay + sDisplay;
};
