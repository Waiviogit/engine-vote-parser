const { cachePoolState, cacheMarketPool } = require('./cacheEnginePrice');
const { botRcEmmiterUpdate, checkBook } = require('./bookJob');
const { cancelExpiringOrders } = require('./cancelExpiringOrdersJob');

cachePoolState.start();
cacheMarketPool.start();
botRcEmmiterUpdate.start();
checkBook.start();
cancelExpiringOrders.start();
