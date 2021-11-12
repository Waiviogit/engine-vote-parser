const engineQuery = require('utilities/hiveEngine/engineQuery');

exports.getBlockInfo = async (blockNumber) => engineQuery({
  method: 'getBlockInfo',
  endpoint: '/blockchain',
  params: {
    blockNumber, //12099755
  },
});
