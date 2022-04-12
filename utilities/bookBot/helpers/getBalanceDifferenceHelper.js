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
  ENGINE_CONTRACTS,
  TOKENS_CONTRACT,
} = require('../../../constants/hiveEngine');
const engineMarket = require('../../hiveEngine/market');

exports.getBalancesDifference = async ({ balances, bot }) => {
  const operations = [];
  const swapBalanceDifference = await getSwapBalanceDifference({
    balances,
    bot,
  });
  if (swapBalanceDifference) operations.push(swapBalanceDifference);

  const symbolBalanceDifference = await getSymbolBalanceDifference({ balances, bot });
  if (symbolBalanceDifference) operations.push(symbolBalanceDifference);

  return operations;
};

const getSwapBalanceDifference = async ({ balances, bot }) => {
  const buyBook = await engineMarket.getBuyBook({ query: { symbol: bot.symbol } });
  if (!buyBook.length) return null;

  const swapBalance = getFormattedBalance(balances);
  const swapTotalBalance = countTotalBalance({
    book: buyBook,
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

const getSymbolBalanceDifference = async ({ balances, bot }) => {
  const sellBook = await engineMarket.getSellBook({ query: { symbol: bot.symbol } });
  if (!sellBook.length) return null;

  const token = await tokensContract.getTokensParams({ query: { symbol: bot.symbol } });
  const symbolBalance = getFormattedBalance(balances, bot.symbol);
  const symbolTotalBalance = countTotalBalance({
    book: sellBook,
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
