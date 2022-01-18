const { lastBlockClient, postRefsClient, expiredPostsClient } = require('utilities/redis/redis');

exports.getHashAll = async (key, client = postRefsClient) => client.hgetallAsync(key);

exports.getLastBlockNum = async (key) => {
  const num = await lastBlockClient.getAsync(key);

  return num ? parseInt(num, 10) : process.env.START_FROM_BLOCK || 29937113;
};

exports.getQuotePrice = async (key) => await lastBlockClient.getAsync(key);

exports.getRewardFound = async (key1, client) => {
  const data = await client.hgetallAsync(key1);
  return data;
};
exports.zrevrange = async ({
  key, start, end, client = expiredPostsClient,
}) => client.zrevrangeAsync(key, start, end);
