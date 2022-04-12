const BOOK_WAIV = {
  account: process.env.BOOK_BOT_WAIV_ACCOUNT,
  key: process.env.BOOK_BOT_WAIV_KEY,
  symbol: 'WAIV',
  tokenPair: 'SWAP.HIVE:WAIV',
  updateQuantityPercent: 70,
  priceDiffPercent: 1,
  buyDiffPercent: 0.02,
  sellDiffPercent: 0.02,
  buyRatio: 3,
  sellRatio: 3,
  startQuantityCoefficient: 0.00005,
  swapBalanceUsage: 1,
  symbolBalanceUsage: 1,
  untouchedSwapPercent: 0.1,
  untouchedSymbolPercent: 0.1,
  profitPercent: 0.001,
  profitUpdateStep: 0.005,
};

exports.POOL_FEE = 0.9975;
exports.START_POSITION = 0;
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
  EXPIRE_SECONDS: 30,
};

exports.BOOK_BOTS = [
  BOOK_WAIV,
];

exports.LOWER_BOUND_PROFIT_PERCENT = 0.9;
