const engineQuery = require('utilities/hiveEngine/engineQuery');

exports.getMarketPools = async ({ query }) => engineQuery({
  params: {
    contract: 'marketpools',
    table: 'pools',
    query,
  },
});

exports.getMarketPoolsParams = async ({ query } = { query: {} }) => engineQuery({
  params: {
    contract: 'marketpools',
    table: 'params',
    query,
  },
});
