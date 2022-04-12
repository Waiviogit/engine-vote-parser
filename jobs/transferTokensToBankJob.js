const cron = require('cron');
const {
  BOOK_BOTS,
  HIVE_PEGGED,
} = require('../constants/bookBot');
const tokensContract = require('../utilities/hiveEngine/tokensContract');
const { getBalancesDifference } = require('../utilities/bookBot/helpers/getBalanceDifferenceHelper');
const { bookBroadcastToChain } = require('../utilities/bookBot/helpers/bookBroadcastToChainHelper');

exports.transferTokensToBank = cron.job('0 0 * * *', async () => {
  for (const bot of BOOK_BOTS) {
    const balances = await tokensContract.getTokenBalances({
      query: {
        symbol: { $in: [HIVE_PEGGED, bot.symbol] },
        account: bot.account,
      },
    });

    const operations = await getBalancesDifference({ balances, bot });
    if (operations.length) await bookBroadcastToChain({ bookBot: bot, operations });
  }
});
