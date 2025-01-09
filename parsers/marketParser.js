const { TOKEN_WAIV } = require('constants/hiveEngine');
const redisSetter = require('utilities/redis/redisSetter');
const redisGetter = require('utilities/redis/redisGetter');
const { GREY_LIST_JOB_KEY, GREY_LIST_KEY } = require('constants/common');
const jsonHelper = require('utilities/helpers/jsonHelper');

const parse = async (transaction, blockNumber, timestamp) => {
  if (process.env.NODE_ENV !== 'production') return;
  if (!['sell', 'marketSell'].includes(transaction.action)) return;

  const payload = jsonHelper.parseJson(transaction.payload, null);
  if (TOKEN_WAIV.SYMBOL === payload?.symbol) {
    const inGreyList = !!await redisGetter.sismember({
      key: GREY_LIST_KEY,
      member: transaction.sender,
    });
    if (inGreyList) return;

    await redisSetter.sadd(GREY_LIST_JOB_KEY, transaction.sender);
  }
};

module.exports = {
  parse,
};
