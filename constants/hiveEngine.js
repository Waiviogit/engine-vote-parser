exports.TOKEN_WAIV = {
  SYMBOL: 'WAIV',
  POOL_ID: 13,
  TAGS: ['waivio', 'neoxian', 'palnet', 'waiv', 'food'],
};

exports.ENGINE_TOKENS = [this.TOKEN_WAIV];

exports.CACHE_POOL_KEY = 'smt_pool';

exports.ENGINE_CONTRACTS = {
  MARKETPOOLS: 'marketpools',
  AIRDROPS: 'airdrops',
};

exports.ENGINE_CONTRACT_ACTIONS = {
  SWAP_TOKENS: 'swapTokens',
  NEW_AIRDROP: 'newAirdrop',
  TOKENS: 'tokens',
};
