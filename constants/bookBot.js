const BOOK_WAIV = {
  account: process.env.BOOK_BOT_WAIV_ACCOUNT,
  key: process.env.BOOK_BOT_WAIV_KEY,
  symbol: 'WAIV',
  tokenPair: 'SWAP.HIVE:WAIV',
  percentSymbol: 0.2,
  percentSwap: 0.2,
};

const BOOK_BEE2 = {
  account: 'dhedge-drips',
  key: process.env.BOOK_BOT_WAIV_KEY,
  symbol: 'WAIV',
  tokenPair: 'SWAP.HIVE:WAIV',
  tradePercent: 0.2,
};

exports.POOL_FEE = 0.9975;

exports.BOOK_BOTS = [
  BOOK_WAIV, BOOK_BEE2,
];
