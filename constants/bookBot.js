const BOOK_BEE = {
  account: 'pi-trader',
  key: 'test',
  symbol: 'WAIV',
  tokenPair: 'SWAP.HIVE:WAIV',
  tradePercent: 0.2,
};

const BOOK_BEE2 = {
  account: 'dhedge-drips',
  key: 'test',
  symbol: 'WAIV',
  tokenPair: 'SWAP.HIVE:WAIV',
  tradePercent: 0.2,
};

exports.POOL_FEE = 0.9975;

exports.BOOK_BOTS = [
  BOOK_BEE, BOOK_BEE2,
];
