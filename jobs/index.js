const { cachePoolState, cacheMarketPool } = require('./cacheEnginePrice');
const { botRcEmmiterUpdate, checkBook } = require('./bookJob');
const { cancelExpiringOrders } = require('./cancelExpiringOrdersJob');
const { transferTokensToBank } = require('./transferTokensToBankJob');

cachePoolState.start();
cacheMarketPool.start();
botRcEmmiterUpdate.start();
checkBook.start();
cancelExpiringOrders.start();
transferTokensToBank.start();
