const redis = require('redis');
const bluebird = require('bluebird');
const config = require('config');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const postRefsClient = redis.createClient(process.env.REDISCLOUD_URL);
const lastBlockClient = redis.createClient(process.env.REDISCLOUD_URL);
const expiredPostsClient = redis.createClient(process.env.REDISCLOUD_URL);
const mainFeedsCacheClient = redis.createClient(config.redisCloudUrl);

lastBlockClient.select(config.redis.lastBlock);
postRefsClient.select(config.redis.wobjectsRefs);
expiredPostsClient.select(config.redis.expiredPosts);
mainFeedsCacheClient.select(config.redis.mainFeedsCache);

module.exports = {
  lastBlockClient,
  postRefsClient,
  expiredPostsClient,
  mainFeedsCacheClient,
};
