const { engineProxy } = require('utilities/hiveEngine/engineQuery');

/**
 * balances of the users
 * fields:
 * account = account owning the balance
 * symbol = symbol of the token
 * balance = quantity of tokens
 * stake = quantity of tokens staked
 * pendingUnstake = quantity of tokens being unstaked
 * delegationsIn = quantity of tokens being delegated to that account
 * delegationsOut = quantity of tokens being delegated to other accounts
 * pendingUndelegations = quantity of tokens being undelegated
 */

exports.getTokenBalances = async ({
  query, hostUrl, offset = 0, limit = 1000,
}) => engineProxy({
  params: {
    contract: 'tokens',
    table: 'balances',
    query,
    offset,
    limit,
  },
  hostUrl,
});

exports.getTokensParams = async ({ query, hostUrl }) => engineProxy({
  params: {
    contract: 'tokens',
    table: 'tokens',
    query,
    offset: 0,
    limit: 1000,
  },
  hostUrl,
});
