const BigNumber = require('bignumber.js');
const _ = require('lodash');
const {
  getFormattedBalance,
  countTotalBalance,
} = require('./bookHelpers');
const {
  HIVE_PEGGED_PRECISION,
  TRANSFER_CONSTANTS,
} = require('../../../constants/bookBot');
const tokensContract = require('../../hiveEngine/tokensContract');
const { MARKET_CONTRACT } = require('../../../constants/hiveEngine');

exports.getBalancesDifference = async ({
  book, type, balances, bot,
}) => {
  if (type === MARKET_CONTRACT.BUY) {
    return getSwapBalanceDifference({
      book,
      balances,
      account: bot.account,
    });
  }

  return getSymbolBalanceDifference({ book, balances, bot });
};

const getSwapBalanceDifference = ({ book, balances, account }) => {
  const swapBalance = getFormattedBalance(balances);
  const swapTotalBalance = countTotalBalance({
    book,
    hivePegged: true,
    botName: account,
    precision: HIVE_PEGGED_PRECISION,
    balance: swapBalance,
  });

  if (BigNumber(swapTotalBalance).isGreaterThan(process.env.INITIAL_SWAP_HIVE_BALANCE)) {
    return {
      contractName: TRANSFER_CONSTANTS.contractName,
      contractAction: TRANSFER_CONSTANTS.contractAction,
      contractPayload:
        {
          symbol: TRANSFER_CONSTANTS.swapHiveSymbol,
          to: process.env.BANK_BOT_ACCOUNT,
          quantity: BigNumber(swapTotalBalance)
            .minus(process.env.INITIAL_SWAP_HIVE_BALANCE).toFixed(),
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

  if (BigNumber(symbolTotalBalance).isGreaterThan(process.env.INITIAL_WAIV_BALANCE)) {
    return {
      contractName: TRANSFER_CONSTANTS.contractName,
      contractAction: TRANSFER_CONSTANTS.contractAction,
      contractPayload: {
        symbol: bot.symbol,
        to: process.env.BANK_BOT_ACCOUNT,
        quantity: BigNumber(symbolTotalBalance)
          .minus(process.env.INITIAL_SWAP_HIVE_BALANCE).toFixed(),
      },
    };
  }

  return null;
};
