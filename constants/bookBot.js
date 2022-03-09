const BOOK_WAIV = {
  account: process.env.BOOK_BOT_WAIV_ACCOUNT,
  key: process.env.BOOK_BOT_WAIV_KEY,
  symbol: 'WAIV',
  tokenPair: 'SWAP.HIVE:WAIV',
  updateQuantityPercent: 70,
  priceDiffPercent: 1,
  positions: {
    first: {
      percentToSellSwap: 0.1,
      percentToSellSymbol: 0.1,
      percentToBuySwap: 0.1,
      percentToBuySymbol: 0.1,
      positionBuy: 0,
      positionSell: 0,
    },
    second: {
      percentToSellSwap: 0.3,
      percentToSellSymbol: 0.3,
      percentToBuySwap: 0.3,
      percentToBuySymbol: 0.3,
      positionBuy: 0.4,
      positionSell: 5,
    },
    third: {
      percentToSellSwap: 0.5,
      percentToSellSymbol: 0.5,
      percentToBuySwap: 0.5,
      percentToBuySymbol: 0.5,
      positionBuy: 0.8,
      positionSell: 10,
    },
  },
};

exports.POOL_FEE = 0.9975;
exports.HIVE_PEGGED_PRECISION = 8;

exports.BOOK_EMITTER_EVENTS = {
  RC: 'bot-rc',
};

exports.REDIS_BOOK = {
  MAIN: 'bookBot',
  MARKET_BUY: 'marketBuy',
  MARKET_SELL: 'marketSell',
  SELL: 'sell',
  BUY: 'buy',
  POSITIONS: 'positions',
  EXPIRE_SECONDS: 60,
};

exports.BOOK_BOTS = [
  BOOK_WAIV,
];
