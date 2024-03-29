const redis = require('redis');
const bluebird = require('bluebird');
const config = require('config');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const postRefsClient = redis.createClient(process.env.REDISCLOUD_URL);
const lastBlockClient = redis.createClient(process.env.REDISCLOUD_URL);
const expiredPostsClient = redis.createClient(process.env.REDISCLOUD_URL);

lastBlockClient.select(config.redis.lastBlock);
postRefsClient.select(config.redis.wobjectsRefs);
expiredPostsClient.select(config.redis.expiredPosts);

module.exports = {
  lastBlockClient,
  postRefsClient,
  expiredPostsClient,
};
