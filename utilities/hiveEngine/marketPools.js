const { engineProxy } = require('utilities/hiveEngine/engineQuery');

exports.getMarketPools = async ({ query }) => engineProxy({
  params: {
    contract: 'marketpools',
    table: 'pools',
    query,
  },
});

exports.getMarketPoolsParams = async ({ query } = { query: {} }) => engineProxy({
  params: {
    contract: 'marketpools',
    table: 'params',
    query,
  },
});
