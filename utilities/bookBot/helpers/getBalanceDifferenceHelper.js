const BigNumber = require('bignumber.js');
const _ = require('lodash');
const {
  getFormattedBalance,
  countTotalBalance,
} = require('./bookHelpers');
const {
  HIVE_PEGGED_PRECISION,
  HIVE_PEGGED,
} = require('../../../constants/bookBot');
const tokensContract = require('../../hiveEngine/tokensContract');
const {
  MARKET_CONTRACT,
  ENGINE_CONTRACTS,
  TOKENS_CONTRACT,
} = require('../../../constants/hiveEngine');

exports.getBalancesDifference = async ({
  book, type, balances, bot,
}) => {
  if (type === MARKET_CONTRACT.BUY) {
    return getSwapBalanceDifference({
      book,
      balances,
      bot,
    });
  }

  return getSymbolBalanceDifference({ book, balances, bot });
};

const getSwapBalanceDifference = ({ book, balances, bot }) => {
  const swapBalance = getFormattedBalance(balances);
  const swapTotalBalance = countTotalBalance({
    book,
    hivePegged: true,
    botName: bot.account,
    precision: HIVE_PEGGED_PRECISION,
    balance: swapBalance,
  });

  if (BigNumber(swapTotalBalance).isGreaterThan(bot.initialSwapHiveBalance)) {
    return {
      contractName: ENGINE_CONTRACTS.TOKENS,
      contractAction: TOKENS_CONTRACT.TRANSFER,
      contractPayload:
        {
          symbol: HIVE_PEGGED,
          to: process.env.BANK_BOT_ACCOUNT,
          quantity: BigNumber(swapTotalBalance)
            .minus(bot.initialSwapHiveBalance).toFixed(),
        },
    };
  }

  return null;
};

const getSymbolBalanceDifference = async ({ book, balances, bot }) => {
  const token = await tokensContract.getTokensParams({ query: { symbol: bot.symbol } });
  const symbolBalance = getFormattedBalance(balances, bot.symbol);
  const symbolTotalBalance = countTotalBalance({
    book,
    botName: bot.account,
    precision: _.get(token, '[0].precision', 8),
    balance: symbolBalance,
  });

  if (BigNumber(symbolTotalBalance).isGreaterThan(bot.initialWaivBalance)) {
    return {
      contractName: ENGINE_CONTRACTS.TOKENS,
      contractAction: TOKENS_CONTRACT.TRANSFER,
      contractPayload: {
        symbol: bot.symbol,
        to: process.env.BANK_BOT_ACCOUNT,
        quantity: BigNumber(symbolTotalBalance)
          .minus(bot.initialWaivBalance).toFixed(),
      },
    };
  }

  return null;
};
