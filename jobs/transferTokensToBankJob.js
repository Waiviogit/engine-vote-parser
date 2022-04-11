const cron = require('cron');
const {
  BOOK_BOTS,
  HIVE_PEGGED,
} = require('../constants/bookBot');
const engineMarket = require('../utilities/hiveEngine/market');
const tokensContract = require('../utilities/hiveEngine/tokensContract');
const { getBalancesDifference } = require('../utilities/bookBot/helpers/getBalanceDifferenceHelper');
const { MARKET_CONTRACT } = require('../constants/hiveEngine');
const { bookBroadcastToChain } = require('../utilities/bookBot/helpers/bookBroadcastToChainHelper');

exports.transferTokensToBank = cron.job('0 0 * * *', async () => {
  for (const bot of BOOK_BOTS) {
    const operations = [];
    const balances = await tokensContract.getTokenBalances({
      query: {
        symbol: { $in: [HIVE_PEGGED, bot.symbol] },
        account: bot.account,
      },
    });

    const buyBook = await engineMarket.getBuyBook({ query: { symbol: bot.symbol } });
    if (buyBook.length) {
      const balanceDifference = await getBalancesDifference({
        book: buyBook,
        type: MARKET_CONTRACT.BUY,
        balances,
        bot,
      });
      if (balanceDifference) operations.push(balanceDifference);
    }

    const sellBook = await engineMarket.getSellBook({ query: { symbol: bot.symbol } });
    if (sellBook.length) {
      const balanceDifference = await getBalancesDifference({
        book: sellBook,
        type: MARKET_CONTRACT.SELL,
        balances,
        bot,
      });
      if (balanceDifference) operations.push(balanceDifference);
    }

    if (operations.length) await bookBroadcastToChain({ bookBot: bot, operations });
  }
});
