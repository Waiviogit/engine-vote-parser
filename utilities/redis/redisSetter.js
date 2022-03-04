const { lastBlockClient, postRefsClient, expiredPostsClient } = require('utilities/redis/redis');
const { COMMENT_REF_TYPES } = require('constants/common');

exports.setLastBlockNum = async (blockNum, redisKey) => {
  if (blockNum) {
    await lastBlockClient.setAsync(redisKey, blockNum);
    await lastBlockClient.publish(redisKey, blockNum);
  }
};

exports.addWobjRef = async (path, rootWobj) => {
  await postRefsClient.hsetAsync(path, 'type', COMMENT_REF_TYPES.createWobj);
  await postRefsClient.hsetAsync(path, 'root_wobj', rootWobj); // root_wobj is author_permlink of wobject(just permlink)
};

exports.addPostWithWobj = async (path, wobjects, guestAuthor) => {
  const wobjectsStr = typeof wobjects === 'string' ? wobjects : JSON.stringify(wobjects);
  await postRefsClient.hsetAsync(path, 'type', COMMENT_REF_TYPES.postWithWobjects);
  await postRefsClient.hsetAsync(path, 'wobjects', wobjectsStr);
  if (guestAuthor) await postRefsClient.hsetAsync(path, 'guest_author', guestAuthor);
};

exports.addAppendWobj = async (path, rootWobj) => {
  await postRefsClient.hsetAsync(path, 'type', COMMENT_REF_TYPES.appendWobj); // author_permlink is 'author' + '_' + 'permlink' of comment with appendWobject
  await postRefsClient.hsetAsync(path, 'root_wobj', rootWobj); // root_wobj is author_permlink of wobject
};

exports.addObjectType = async (path, name) => {
  await postRefsClient.hsetAsync(path, 'type', COMMENT_REF_TYPES.wobjType);
  await postRefsClient.hsetAsync(path, 'name', name);
};

exports.hmsetAsync = async (key, data, client = lastBlockClient) => client.hmsetAsync(key, data);

exports.setExpireTTL = async ({
  key, data, client = expiredPostsClient, expire,
}) => client.setAsync(key, data, 'EX', expire);

exports.delKey = async (key, client = expiredPostsClient) => client.delAsync(key);
