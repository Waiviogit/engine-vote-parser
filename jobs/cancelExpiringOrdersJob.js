const cron = require('cron');
const {
  BOOK_BOTS,
  REDIS_BOOK,
} = require('../constants/bookBot');
const engineMarket = require('../utilities/hiveEngine/market');
const { handleOrders } = require('../utilities/helpers/cancelExpiringOrdersHelper');

// не забудь поменять на отработку раз в день в полночь!!!
exports.cancelExpiringOrders = cron.job('*/5 * * * * *', async () => {
   console.log('here!');
  for (const bot of BOOK_BOTS) {
    const buyBook = await engineMarket.getBuyBook({ query: { symbol: bot.symbol } });
    if (buyBook.length) {
      await handleOrders({
        book: buyBook,
        type: REDIS_BOOK.BUY,
        bookBot: bot,
      });
    }

    const sellBook = await engineMarket.getSellBook({ query: { symbol: bot.symbol } });
    if (sellBook.length) {
      await handleOrders({
        book: sellBook,
        type: REDIS_BOOK.SELL,
        bookBot: bot,
      });
    }
  }

  // cделать бродкаст на все
});
