const engineQuery = require('utilities/hiveEngine/engineQuery');

exports.getBlockInfo = async (blockNumber, hostUrl) => engineQuery({
  method: 'getBlockInfo',
  endpoint: '/blockchain',
  hostUrl,
  params: { blockNumber },
});

exports.getLatestBlockInfo = async () => engineQuery({
  method: 'getLatestBlockInfo',
  endpoint: '/blockchain',
});
