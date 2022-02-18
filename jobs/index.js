const { cachePoolState, cacheMarketPool } = require('./cacheEnginePrice');
const { botRcEmmiterUpdate } = require('./emiterJob');

cachePoolState.start();
cacheMarketPool.start();
botRcEmmiterUpdate.start();
