const cron = require('cron');
const { BOOK_BOTS } = require('../constants/bookBot');
const engineMarket = require('../utilities/hiveEngine/market');
const { MARKET_CONTRACT } = require('../constants/hiveEngine');
const { handleOrders } = require('../utilities/bookBot/helpers/cancelExpiringOrdersHelper');
const { bookBroadcastToChain } = require('../utilities/bookBot/helpers/bookBroadcastToChainHelper');

exports.cancelExpiringOrders = cron.job('0 0 * * *', async () => {
  for (const bot of BOOK_BOTS) {
    const operations = [];

    const buyBook = await engineMarket.getBuyBook({ query: { symbol: bot.symbol } });
    if (buyBook.length) {
      const expiringBuyOperations = await handleOrders({
        book: buyBook,
        type: MARKET_CONTRACT.BUY,
        bookBot: bot,
      });
      if (expiringBuyOperations.length) operations.push(...expiringBuyOperations);
    }

    const sellBook = await engineMarket.getSellBook({ query: { symbol: bot.symbol } });
    if (sellBook.length) {
      const expiringSellOperations = await handleOrders({
        book: sellBook,
        type: MARKET_CONTRACT.SELL,
        bookBot: bot,
      });
      if (expiringSellOperations.length) operations.push(...expiringSellOperations);
    }

    if (operations.length) await bookBroadcastToChain({ bookBot: bot, operations });
  }
});
