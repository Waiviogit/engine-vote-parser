const BOOK_WAIV = {
  account: process.env.BOOK_BOT_WAIV_ACCOUNT,
  key: process.env.BOOK_BOT_WAIV_KEY,
  symbol: 'WAIV',
  tokenPair: 'SWAP.HIVE:WAIV',
  percentSymbol: 0.5,
  percentSwap: 0.5,
};

exports.POOL_FEE = 0.9975;

exports.BOOK_QUEUE = 'bookBot';
exports.BOOK_DELAY = 5;

exports.BOOK_BOTS = [
  BOOK_WAIV,
];
