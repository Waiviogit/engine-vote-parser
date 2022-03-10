const { cachePoolState, cacheMarketPool } = require('./cacheEnginePrice');
const { botRcEmmiterUpdate, checkBook } = require('./bookJob');

cachePoolState.start();
cacheMarketPool.start();
botRcEmmiterUpdate.start();
checkBook.start();
