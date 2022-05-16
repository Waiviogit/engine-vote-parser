exports.TOKEN_WAIV = {
  SYMBOL: 'WAIV',
  POOL_ID: 13,
  TAGS: ['waivio', 'neoxian', 'palnet', 'waiv', 'food'],
  MARKET_POOL_ID: 63,
};

exports.ENGINE_TOKENS = [this.TOKEN_WAIV];

exports.CACHE_POOL_KEY = 'smt_pool';

exports.CACH_MARKET_POOL_KEY = 'market_pool';

exports.ENGINE_CONTRACTS = {
  MARKETPOOLS: 'marketpools',
  AIRDROPS: 'airdrops',
  TOKENS: 'tokens',
  COMMENTS: 'comments',
  MARKET: 'market',
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
  UPDATE_VOTE: 'updateVote',
  CURATION_REWARD: 'curationReward',
  AUTHOR_REWARD: 'authorReward',
  BENEFICIARY_REWARD: 'beneficiaryReward',
};

exports.POST_REWARD_EVENTS = [
  this.ENGINE_EVENTS.CURATION_REWARD,
  this.ENGINE_EVENTS.AUTHOR_REWARD,
  this.ENGINE_EVENTS.BENEFICIARY_REWARD,
];

exports.MARKET_CONTRACT = {
  CANCEL: 'cancel',
  BUY: 'buy',
  MARKET_BUY: 'marketBuy',
  SELL: 'sell',
  MARKET_SELL: 'marketSell',
  ORDER_CLOSED: 'orderClosed',
  ORDER_EXPIRED: 'orderExpired',
};

exports.TOKENS_CONTRACT = {
  TRANSFER: 'transfer',
  TRANSFER_FROM_CONTRACT: 'transferFromContract',
  TRANSFER_TO_CONTRACT: 'transferToContract',
  ISSUE: 'issue',
  UPDATE_PRECISION: 'updatePrecision',
  UPDATE_URL: 'updateUrl',
  UPDATE_METADATA: 'updateMetadata',
  TRANSFER_OWNERSHIP: 'transferOwnership',
  CREATE: 'create',
  ENABLE_STAKING: 'enableStaking',
  STAKE: 'stake',
  STAKE_FROM_CONTRACT: 'stakeFromContract',
  UNSTAKE: 'unstake',
  CANCEL_UNSTAKE: 'cancelUnstake',
  ENABLE_DELEGATION: 'enableDelegation',
  DELEGATE: 'delegate',
  UNDELEGATE: 'undelegate',
  CHECK_PENDING_UNSTAKES: 'checkPendingUnstakes',
  CHECK_PENDING_UNDELEGATIONS: 'checkPendingUndelegations',
  UPDATE_PARAMS: 'updateParams',
  ISSUE_TO_CONTRACT: 'issueToContract',
};

exports.COMMENTS_CONTRACT = {
  BENEFICIARY_REWARD: 'comments_beneficiaryReward',
};

exports.MARKET_CONTRACT_BOOKBOT_EVENT = [
  this.MARKET_CONTRACT.MARKET_SELL,
  this.MARKET_CONTRACT.SELL,
  this.MARKET_CONTRACT.BUY,
  this.MARKET_CONTRACT.MARKET_BUY,
];
