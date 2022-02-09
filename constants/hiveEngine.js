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
  TOKENS: 'tokens',
  COMMENTS: 'comments',
};

exports.ENGINE_CONTRACT_ACTIONS = {
  SWAP_TOKENS: 'swapTokens',
  NEW_AIRDROP: 'newAirdrop',
  TRANSFER: 'transfer',
  DELEGATE: 'delegate',
  UNDELEGATE: 'undelegate',
  STAKE: 'stake',
  UNSTAKE: 'unstake',
  VOTE: 'vote',
  CANCEL_UNSTAKE: 'cancelUnstake',
};

exports.ENGINE_EVENTS = {
  NEW_VOTE: 'newVote',
  CURATION_REWARD: 'curationReward',
  AUTHOR_REWARD: 'authorReward',
  BENEFICIARY_REWARD: 'beneficiaryReward',
};

exports.POST_REWARD_EVENTS = [
  this.ENGINE_EVENTS.CURATION_REWARD,
  this.ENGINE_EVENTS.AUTHOR_REWARD,
  this.ENGINE_EVENTS.BENEFICIARY_REWARD,
];
