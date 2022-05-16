const {
  Post, GuestWallet,
} = require('models');
const { GUEST_WALLET_TYPE } = require('constants/common');
const axios = require('axios');
const _ = require('lodash');

const addAuthorRewards = async () => {
  const params = { symbol: 'WAIV', account: 'waivio.hpower', ops: 'comments_beneficiaryReward' };
  const history = await getAccountHistory(params);
  if (_.isEmpty(history)) return;
  for (const record of history) {
    const { post } = await Post.findOne({
      root_author: record.authorperm.split('/')[0].substring(1),
      permlink: record.authorperm.split('/')[1],
    });
    if (!post) continue;

    await GuestWallet.create({
      blockNumber: record.blockNumber,
      account: post.author,
      transactionId: record.author,
      operation: GUEST_WALLET_TYPE.AUTHOR_REWARD,
      timestamp: record.timestamp,
      quantity: record.quantity,
      symbol: record.symbol,
      authorperm: `@${post.author}/${post.permlink}`,
    });
  }
};

const getAccountHistory = async (params) => {
  try {
    const response = await axios.get('https://accounts.hive-engine.com/accountHistory', { params });
    return _.get(response, 'data');
  } catch (error) {
    return error;
  }
};

(async () => {
  await addAuthorRewards();
  console.log('Task Finished');
})();
