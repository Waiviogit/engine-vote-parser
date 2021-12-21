const {
  Post, Wobj, User, UserWobjects,
} = require('models');
const { commentRefGetter } = require('utilities/commentRefService');
const { REDIS_KEYS } = require('constants/parsersData');
const {
  ENGINE_TOKENS, CACHE_POOL_KEY, ENGINE_EVENTS, POST_REWARD_EVENTS,
} = require('constants/hiveEngine');
const EngineAccountHistoryModel = require('models/EngineAccountHistoryModel');
const moment = require('moment');
const redisGetter = require('utilities/redis/redisGetter');
const { lastBlockClient } = require('utilities/redis/redis');
const jsonHelper = require('utilities/helpers/jsonHelper');
const _ = require('lodash');
const BigNumber = require('bignumber.js');

exports.parse = async ({ transactions, blockNumber, timestamps }) => {
  const { votes, rewards } = this.formatVotesAndRewards({ transactions, blockNumber, timestamps });

  await this.processRewards(rewards);
  await this.parseEngineVotes(votes);
};

exports.processRewards = async (rewards) => {
  if (_.isEmpty(rewards)) return;
  await EngineAccountHistoryModel.insertMany(rewards);
  const rewardsOnPosts = aggregateRewardsOnPosts(rewards);
  const { posts = [] } = await Post.getManyPosts(getConditionFromRewards(rewardsOnPosts));
  for (const post of posts) {
    await Post.updateOne(
      { root_author: post.root_author, permlink: post.permlink },
      getRewardsUpdateData({ post, rewardsOnPosts }),
    );
  }
};

exports.parseEngineVotes = async (votes) => {
  if (_.isEmpty(votes)) return;
  const votesWithAdditionalData = await votesFormat(votes);
  const { posts = [] } = await Post.getManyPosts(getConditionFromVotes(votesWithAdditionalData));
  const { processedPosts } = await addRsharesToPost({ votes: votesWithAdditionalData, posts });
  await distributeHiveEngineExpertise({ votes: votesWithAdditionalData, posts: processedPosts });
};

exports.formatVotesAndRewards = ({ transactions, blockNumber, timestamps }) => _.reduce(
  transactions, (acc, transaction) => {
    const events = _.get(jsonHelper.parseJson(transaction.logs), 'events', []);
    if (_.isEmpty(events)
    && !_.some(events, (e) => _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(e, 'data.symbol')))
    ) {
      return acc;
    }
    for (const event of events) {
      const parseVoteCondition = _.get(event, 'event') === ENGINE_EVENTS.NEW_VOTE
        && _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(event, 'data.symbol'))
        && parseFloat(_.get(event, 'data.rshares')) !== 0;
      const parseRewardsCondition = _.includes(POST_REWARD_EVENTS, _.get(event, 'event'))
        && _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(event, 'data.symbol'))
        && parseFloat(_.get(event, 'data.quantity')) !== 0;

      if (parseVoteCondition) {
        acc.votes.push({
          ...jsonHelper.parseJson(transaction.payload),
          rshares: parseFloat(_.get(event, 'data.rshares')),
          symbol: _.get(event, 'data.symbol'),
        });
      }
      if (parseRewardsCondition) {
        acc.rewards.push({
          operation: `${transaction.contract}_${event.event}`,
          ...event.data,
          blockNumber,
          refHiveBlockNumber: transaction.refHiveBlockNumber,
          transactionId: transaction.transactionId,
          timestamp: moment(timestamps).unix(),
        });
      }
    }
    return acc;
  }, { votes: [], rewards: [] },
);

const aggregateRewardsOnPosts = (rewards) => _.reduce(rewards, (acc, reward) => {
  if (!_.has(acc, `${reward.authorperm}`)) {
    acc[reward.authorperm] = {
      [reward.symbol]: BigNumber(reward.quantity).toNumber(),
    };
  } else {
    _.has(acc[reward.authorperm], `${reward.symbol}`)
      ? acc[reward.authorperm][reward.symbol] = BigNumber(acc[reward.authorperm][reward.symbol])
        .plus(reward.quantity)
        .toNumber()
      : acc[reward.authorperm][reward.symbol] = BigNumber(reward.quantity).toNumber();
  }
  return acc;
}, {});

const getConditionFromRewards = (rewardsOnPosts) => _.map(
  Object.keys(rewardsOnPosts),
  (p) => ({ root_author: p.split('/')[0].substring(1), permlink: p.split('/')[1] }),
);

const getRewardsUpdateData = ({ post, rewardsOnPosts }) => _.reduce(
  rewardsOnPosts[`@${post.root_author}/${post.permlink}`], (acc, el, index) => {
    acc[`total_rewards_${index}`] = BigNumber(_.get(post, `total_rewards_${index}`, 0))
      .plus(el)
      .toNumber();
    return acc;
  }, {},
);

const votesFormat = async (votesOps) => {
  let accounts = [];
  votesOps = _
    .chain(votesOps)
    .orderBy(['weight'], ['desc'])
    .uniqWith((first, second) => first.author === second.author && first.permlink === second.permlink && first.voter === second.voter)
    .value();
  for (const voteOp of votesOps) {
    const response = await commentRefGetter.getCommentRef(`${voteOp.author}_${voteOp.permlink}`);
    accounts = _.concat(accounts, voteOp.author, voteOp.voter);
    if (_.get(response, 'type')) {
      voteOp.type = response.type;
      voteOp.root_wobj = response.root_wobj;
      voteOp.name = response.name;
      voteOp.guest_author = response.guest_author;
      let wobjects;
      if (response) {
        try {
          wobjects = JSON.parse(response.wobjects);
        } catch (e) {
          wobjects = [];
        }
      }
      voteOp.wobjects = wobjects;
    }
  }
  return votesOps;
};

const getConditionFromVotes = (votes) => {
  const postReqData = _.map(
    votes,
    (v) => ({ root_author: v.author, permlink: v.permlink }),
  );
  return _.uniqWith(postReqData, _.isEqual);
};

const getProcessedVotes = async (votes) => {
  const votedPosts = await redisGetter
    .zrevrange({ key: REDIS_KEYS.PROCESSED_LIKES, start: 0, end: -1 });
  return _.filter(votes, (e) => _.some(_.map(votedPosts, (el) => ({
    voter: el.split(':')[0],
    author: el.split(':')[1],
    permlink: el.split(':')[2],
  })), (l) => l.voter === e.voter && l.author === e.author && l.permlink === e.permlink));
};

const getCashedRewards = async () => {
  const rewardsData = {};
  for (const token of ENGINE_TOKENS) {
    const { rewards } = await redisGetter.getHashAll(
      `${CACHE_POOL_KEY}:${token.SYMBOL}`,
      lastBlockClient,
    );
    rewardsData[token.SYMBOL] = rewards;
  }
  return rewardsData;
};

const addRsharesToPost = async ({ votes, posts }) => {
  const votesProcessedOnApi = await getProcessedVotes(votes);
  const rewards = await getCashedRewards();

  for (const vote of votes) {
    if (!vote.type) continue;
    const processed = _.find(votesProcessedOnApi, (el) => _.isEqual(vote, el));
    if (processed) continue;
    const post = _.find(posts,
      (p) => (p.author === vote.author || p.author === vote.guest_author)
        && p.permlink === vote.permlink);
    if (!post) continue;
    const createdOverAWeek = moment().diff(moment(_.get(post, 'createdAt')), 'day') > 7;
    if (!createdOverAWeek) {
      post[`net_rshares_${vote.symbol}`] = BigNumber(_.get(post, `net_rshares_${vote.symbol}`, 0))
        .plus(vote.rshares)
        .toNumber();
      post[`total_payout_${vote.symbol}`] = BigNumber(post[`net_rshares_${vote.symbol}`])
        .times(rewards[vote.symbol])
        .toNumber();
    }
    const voteInPost = _.find(post.active_votes, (v) => v.voter === vote.voter);
    voteInPost
      ? voteInPost[`rshares${vote.symbol}`] = vote.rshares
      : post.active_votes.push({
        voter: vote.voter,
        percent: vote.weight,
        [`rshares${vote.symbol}`]: vote.rshares,
      });
  }
  await updatePostsRshares(posts);
  return { processedPosts: posts };
};

const updatePostsRshares = async (posts) => {
  for (const post of posts) {
    const updateData = _.reduce(ENGINE_TOKENS, (acum, token) => {
      if (_.has(post, `net_rshares_${token.SYMBOL}`)) {
        acum[`net_rshares_${token.SYMBOL}`] = post[`net_rshares_${token.SYMBOL}`];
      }
      if (_.has(post, `total_payout_${token.SYMBOL}`)) {
        acum[`total_payout_${token.SYMBOL}`] = post[`total_payout_${token.SYMBOL}`];
      }
      return acum;
    }, {});
    if (_.isEmpty(updateData)) continue;
    await Post.updateOne(
      { author: post.author, permlink: post.permlink },
      {
        active_votes: post.active_votes,
        ...updateData,
      },
    );
  }
};

const distributeHiveEngineExpertise = async ({ votes, posts }) => {
  for (const vote of votes) {
    const post = posts.find(
      (p) => (p.author === vote.author || p.author === vote.guest_author)
        && p.permlink === vote.permlink,
    );
    if (!post) continue;
    const currentVote = post.active_votes.find((v) => v.voter === vote.voter);
    if (!currentVote) continue;
    for (const wObject of _.get(post, 'wobjects', [])) {
      const wobjectRshares = _.reduce(ENGINE_TOKENS, (accum, token) => {
        if (_.has(currentVote, `rshares${token.SYMBOL}`)) {
          accum[token.SYMBOL] = Number((currentVote[`rshares${token.SYMBOL}`] * (wObject.percent / 100)).toFixed(3));
        }
        return accum;
      }, {});
      if (_.isEmpty(wobjectRshares)) continue;
      await updateExpertiseInDb({
        currentVote, wobjectRshares, post, wObject,
      });
    }
  }
};

const updateExpertiseInDb = async ({
  currentVote, wobjectRshares, post, wObject,
}) => {
  // object and voter expertise always positive
  await Wobj.update(
    { author_permlink: wObject.author_permlink },
    { $inc: formExpertiseUpdateData({ wobjectRshares, isAbs: true, divideBy: 1 }) },
  );
  await User.updateOne(
    { name: currentVote.voter },
    { $inc: formExpertiseUpdateData({ wobjectRshares, isAbs: true, divideBy: 2 }) },
  );
  await UserWobjects.updateOne(
    { user_name: currentVote.voter, author_permlink: wObject.author_permlink },
    { $inc: formExpertiseUpdateData({ wobjectRshares, isAbs: true, divideBy: 2 }) },
    { upsert: true, setDefaultsOnInsert: true },
  );
  // post author can have negative expertise
  await User.updateOne(
    { name: post.author },
    { $inc: formExpertiseUpdateData({ wobjectRshares, isAbs: false, divideBy: 2 }) },
  );
  await UserWobjects.updateOne(
    { user_name: post.author, author_permlink: wObject.author_permlink },
    { $inc: formExpertiseUpdateData({ wobjectRshares, isAbs: false, divideBy: 2 }) },
    { upsert: true, setDefaultsOnInsert: true },
  );
};

const formExpertiseUpdateData = ({ wobjectRshares, divideBy, isAbs }) => _.reduce(
  wobjectRshares, (accum, rshares, index) => {
    const result = BigNumber(rshares).div(divideBy).toNumber();
    accum[`expertise${index}`] = isAbs ? Math.abs(result) : result;
    return accum;
  }, {},
);
