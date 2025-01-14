const redisSetter = require('../redis/redisSetter');
const { GREY_LIST_KEY } = require('../../constants/common');

const addToGreyList = async (account = '') => {
  if (!account) return;
  if (process.env.NODE_ENV !== 'production') return;
  await redisSetter.sadd(GREY_LIST_KEY, account);
};

module.exports = {
  addToGreyList,
};
