const { GREY_LIST_KEY } = require('constants/common');
const redisSetter = require('utilities/redis/redisSetter');
const users = require('./greylist.json');

const addToGreyList = async () => {
  await redisSetter.sadd(GREY_LIST_KEY, users);
};

(async () => {
  await addToGreyList();
  process.exit();
})();
