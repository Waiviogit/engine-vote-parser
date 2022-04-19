const { engineQuery, engineProxy } = require('utilities/hiveEngine/engineQuery');

exports.getBlockInfo = async (blockNumber, hostUrl) => engineQuery({
  method: 'getBlockInfo',
  endpoint: '/blockchain',
  hostUrl,
  params: { blockNumber },
});

exports.getLatestBlockInfo = async () => engineProxy({
  method: 'getLatestBlockInfo',
  endpoint: '/blockchain',
});

exports.getTransactionInfo = async ({ params }) => engineProxy({
  method: 'getTransactionInfo',
  endpoint: '/blockchain',
  params,
});
