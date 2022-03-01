const BOOK_WAIV = {
  account: process.env.BOOK_BOT_WAIV_ACCOUNT,
  key: process.env.BOOK_BOT_WAIV_KEY,
  symbol: 'WAIV',
  tokenPair: 'SWAP.HIVE:WAIV',
  percentSymbol: 0.5,
  percentSwap: 0.5,
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
  EXPIRE_SECONDS: 60,
};

exports.BOOK_BOTS = [
  BOOK_WAIV,
];
