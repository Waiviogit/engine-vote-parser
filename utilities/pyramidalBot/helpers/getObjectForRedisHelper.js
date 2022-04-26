exports.getObjectForRedis = (pool, timestamp) => ({
  baseQuantity: pool.baseQuantity,
  quoteQuantity: pool.quoteQuantity,
  tokenPair: pool.tokenPair,
  timestamp,
});
