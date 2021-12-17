const _ = require('lodash');
const { Post } = require('models');

exports.parse = async (transactions) => {
  const filtered = _.reduce(transactions, (acc, el) => {
    if (_.get(el, 'contract') !== 'comments') return acc;
    const logs = parseJson(_.get(el, 'logs'));
    if (_.isEmpty(_.get(logs, 'events'))) return acc;
    for (const item of logs.events) {
      if (_.get(item, 'event') === 'authorReward' && _.get(item, 'data.rewardPoolId') === 13) {
        acc.push(item.data);
      }
    }
    return acc;
  }, []);
  if (_.isEmpty(filtered)) return;
  for (const reward of filtered) {
    const [author, permlink] = reward.authorperm.split('/');
    // count also curator reward
    // eslint-disable-next-line camelcase
    const total_payout_WAIV = (parseFloat(reward.quantity) * 2).toFixed(8);
    await Post.updateOne(
      {
        root_author: author.substring(1),
        permlink,
      },
      { total_payout_WAIV },
    );
  }
};

const parseJson = (json) => {
  try {
    return JSON.parse(json);
  } catch (e) { return {}; }
};
