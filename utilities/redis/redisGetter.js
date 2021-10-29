const { lastBlockClient, postRefsClient } = require('utilities/redis/redis');

exports.getHashAll = async (key, client = postRefsClient) => client.hgetallAsync(key);

exports.getLastBlockNum = async (key) => {
  const num = await lastBlockClient.getAsync(key);

  return num ? parseInt(num, 10) : process.env.START_FROM_BLOCK || 29937113;
};
