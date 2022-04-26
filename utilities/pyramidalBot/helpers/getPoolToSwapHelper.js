const BigNumber = require('bignumber.js');
const _ = require('lodash');

exports.getPoolToSwap = ({
  pools, bot, buy = false, stablePool, tokens, balances,
}) => {
  const dataToCompare = [];
  const [stableBase] = stablePool.tokenPair.split(':');

  for (const pool of pools) {
    const [base, quote] = pool.tokenPair.split(':');
    base === bot.tokenSymbol
      ? dataToCompare.push({
        coefficient: pool.tokenPair.includes(stableBase)
          ? BigNumber(pool.basePrice).multipliedBy(stablePool.basePrice)
            .toFixed(stablePool.precision)
          : BigNumber(pool.basePrice).multipliedBy(stablePool.quotePrice)
            .toFixed(stablePool.precision),
        tokenPair: pool.tokenPair,
        stableTokenSymbol: quote,
        stableTokenPrecision: _.find(tokens, (token) => token.symbol === quote).precision,
        balance: _.find(balances, (balance) => balance.symbol === quote).balance,
        poolPrecision: pool.precision,
        baseQuantity: pool.baseQuantity,
        quoteQuantity: pool.quoteQuantity,
      })
      : dataToCompare.push({
        coefficient: pool.tokenPair.includes(stableBase)
          ? BigNumber(pool.quotePrice).multipliedBy(stablePool.basePrice)
            .toFixed(stablePool.precision)
          : BigNumber(pool.quotePrice).multipliedBy(stablePool.quotePrice)
            .toFixed(stablePool.precision),
        tokenPair: pool.tokenPair,
        stableTokenSymbol: base,
        stableTokenPrecision: _.find(tokens, (token) => token.symbol === base).precision,
        balance: _.find(balances, (balance) => balance.symbol === base).balance,
        poolPrecision: pool.precision,
        baseQuantity: pool.baseQuantity,
        quoteQuantity: pool.quoteQuantity,
      });
  }

  return buy ? dataToCompare
    .reduce((acc, current) => (acc.coefficient < current.coefficient ? acc : current))
    : dataToCompare
      .reduce((acc, current) => (acc.coefficient > current.coefficient ? acc : current));
};
