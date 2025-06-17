const {
  Post, Wobj, User, UserExpertiseModel, GuestWallet,
} = require('models');
const { commentRefGetter } = require('utilities/commentRefService');
const { REDIS_KEYS } = require('constants/parsersData');
const {
  ENGINE_TOKENS, CACHE_POOL_KEY, ENGINE_EVENTS, POST_REWARD_EVENTS, COMMENTS_CONTRACT,
} = require('constants/hiveEngine');
const moment = require('moment');
const redisGetter = require('utilities/redis/redisGetter');
const redisSetter = require('utilities/redis/redisSetter');
const { lastBlockClient } = require('utilities/redis/redis');
const jsonHelper = require('utilities/helpers/jsonHelper');
const _ = require('lodash');
const BigNumber = require('bignumber.js');
const userValidator = require('validator/userValidator');
const calculateEngineExpertise = require('utilities/helpers/calculateEngineExpertise');
const appHelper = require('utilities/helpers/appHelper');
const { GUEST_WALLET_TYPE, GUEST_AVAILABLE_TOKEN } = require('constants/common');
const { VOTE_TYPES } = require('../constants/parsersData');
const { calculateHiveEngineVote } = require('../utilities/hiveEngine/operations');
const { getWeightForFieldUpdate } = require('../utilities/helpers/rewardsHelper');
const { FIELDS_NAMES } = require('../constants/wobjectsData');

exports.parse = async ({
  transactions, blockNumber, timestamp, refHiveBlockNumber,
}) => {
  const { votes, rewards } = this.formatVotesAndRewards({ transactions, blockNumber, timestamp });

  await this.processRewards(rewards);
  await this.parseEngineVotes({ votes, refHiveBlockNumber });
};

exports.processRewards = async (rewards) => {
  if (_.isEmpty(rewards)) return;
  await checkGuestPostReward(rewards);

  // await EngineAccountHistoryModel.insertMany(rewards);
  const rewardsOnPosts = aggregateRewardsOnPosts(rewards);
  const { posts = [] } = await Post.getManyPosts(getConditionFromRewards(rewardsOnPosts));
  for (const post of posts) {
    await Post.updateOne(
      { root_author: post.root_author, permlink: post.permlink },
      getRewardsUpdateData({ post, rewardsOnPosts }),
    );
  }
};

exports.parseEngineVotes = async ({ votes, refHiveBlockNumber }) => {
  if (_.isEmpty(votes)) return;
  const votesWithAdditionalData = await votesFormat(votes);
  const { posts = [] } = await Post.getManyPosts(getConditionFromVotes(votesWithAdditionalData));
  const { processedPosts } = await addRsharesToPost({ votes: votesWithAdditionalData, posts });
  await distributeHiveEngineExpertise({ votes: votesWithAdditionalData, posts: processedPosts });
  await voteOnObjectFields({
    votes: votesWithAdditionalData?.filter((v) => v.type === VOTE_TYPES.APPEND_WOBJ && v.weight >= 0),
    refHiveBlockNumber,
  });
};

exports.formatVotesAndRewards = ({
  transactions,
  blockNumber,
  timestamp,
}) => _.reduce(transactions, (acc, transaction) => {
  const events = _.get(jsonHelper.parseJson(transaction.logs), 'events', []);
  if (_.isEmpty(events)
        && !_.some(
          events,
          (e) => _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(e, 'data.symbol')),
        )
  ) {
    return acc;
  }
  for (const event of events) {
    const eventType = _.get(event, 'event');
    const parseVoteCondition = _.includes(
      [ENGINE_EVENTS.NEW_VOTE, ENGINE_EVENTS.UPDATE_VOTE],
      eventType,
    )
            && _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(event, 'data.symbol'))
            && (
              (eventType === ENGINE_EVENTS.NEW_VOTE && parseFloat(_.get(event, 'data.rshares')) !== 0)
                || eventType === ENGINE_EVENTS.UPDATE_VOTE
            );
    const parseRewardsCondition = _.includes(POST_REWARD_EVENTS, _.get(event, 'event'))
            && _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(event, 'data.symbol'))
            && parseFloat(_.get(event, 'data.quantity')) !== 0;

    if (parseVoteCondition) {
      acc.votes.push({
        ...jsonHelper.parseJson(transaction.payload),
        rshares: parseFloat(_.get(event, 'data.rshares', '0')),
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
        timestamp: moment(timestamp).unix(),
      });
    }
  }
  return acc;
}, { votes: [], rewards: [] });

const getUserExpertiseInWobj = async (vote) => {
  const { result, error } = await UserExpertiseModel.find({
    condition: {
      author_permlink: vote.root_wobj,
      user_name: vote.voter,
    },
  });

  if (error) return 1;
  if (!result) return 1;

  return result?.weight || 1;
};

const addWeightAndExpertiseOnVote = async (vote, field) => {
  const { weight } = await User.checkForObjectShares({
    name: vote.voter,
    author_permlink: vote.root_wobj,
  });
  const tokenParams = ENGINE_TOKENS.find((t) => t.SYMBOL === vote.symbol);
  if (!Number(vote?.rshares)) {
    const { rshares } = await calculateHiveEngineVote({
      symbol: vote.symbol,
      account: vote.voter,
      weight,
      poolId: tokenParams.POOL_ID,
      dieselPoolId: tokenParams.MARKET_POOL_ID,
    });
    vote.rshares = rshares;
  }

  const userWobjectWeight = await getUserExpertiseInWobj(vote);
  const usdValue = await calculateEngineExpertise(vote.rshares, tokenParams.SYMBOL);
  // here we need transform usd value to hive rshares * 1e6
  const expertiseInRshares = await getWeightForFieldUpdate(userWobjectWeight);
  const voteInRshares = await getWeightForFieldUpdate(usdValue);

  const weightOnField = (expertiseInRshares + voteInRshares * 0.5) * (weight / 10000);

  const existedVote = _.find(field.active_votes, (v) => v.voter === vote.voter);

  return {
    ...existedVote,
    expertiseUSD: usdValue,
    [`weight${tokenParams.SYMBOL}`]: weightOnField,
  };
};

const voteOnObjectFields = async ({ votes = [], refHiveBlockNumber }) => {
  if (!votes.length) return;
  const { users: blacklistUsers = [] } = await appHelper.getBlackListUsers();
  const shouldProcessVote = (vote, field) => {
    if (field.name === FIELDS_NAMES.AUTHORITY && field.creator !== vote.voter) return false;
    const voterInVotes = !!_.find(field.active_votes, (el) => el.voter === vote.voter);
    const hasTokenParams = ENGINE_TOKENS.find((t) => t.SYMBOL === vote.symbol);

    return !blacklistUsers.includes(vote.voter)
        && vote.percent > 0
        && voterInVotes
        && hasTokenParams;
  };
  const getLastVotesByVoter = (votesArr, field) => {
    const lastVoteByVoter = new Map();
    for (const v of votesArr) {
      if (!shouldProcessVote(v, field)) continue;
      lastVoteByVoter.set(v.voter, v);
    }
    return Array.from(lastVoteByVoter.values());
  };

  const processRootWobjGroup = async (rootWobj, groupVotes) => {
    const updateData = {};
    const arrayFilters = [];
    const votesByObj = groupVotes.map((el) => ({
      ...el,
      groupKey: `${el.author}_${el.permlink}`,
    }));
    const groupedByField = _.groupBy(votesByObj, 'groupKey');

    for (const groupKey of Object.keys(groupedByField)) {
      const [author, permlink] = groupKey.split('_');
      const { field } = await Wobj.getField(author, permlink, rootWobj);
      if (!field) continue;

      const updatesOnField = groupedByField[groupKey];

      // Only keep the last vote per voter
      const lastVotes = getLastVotesByVoter(updatesOnField, field);
      if (!lastVotes.length) continue;

      // Process votes in parallel
      const processedVotes = await Promise.all(
        lastVotes.map(async (v) => addWeightAndExpertiseOnVote(v, field)),
      );
      const voters = processedVotes.map((v) => v.voter);

      // Remove old votes from same voters
      const filteredVotes = field.active_votes.filter((v) => !voters.includes(v.voter));
      // Add new votes
      const newVotes = [
        ...filteredVotes,
        ...processedVotes,
      ].map((v) => ({
        voter: v.voter,
        percent: v.percent,
        rshares_weight: v.rshares_weight,
        weight: v.weight,
        weightWAIV: v.weightWAIV,
      }));

      const fieldWeight = newVotes.reduce((acc, el) => acc + el.weightWAIV, 0);
      const expertiseUSD = processedVotes.reduce(
        (acc, el) => acc + el.expertiseUSD,
        0,
      );

      updateData[`fields.$[${permlink}].weightWAIV`] = fieldWeight;
      updateData[`fields.$[${permlink}].active_votes`] = newVotes;
      arrayFilters.push({ [`${permlink}.permlink`]: permlink });

      // Update user expertise
      await User.increaseWobjectWeight({
        name: field.creator,
        author_permlink: rootWobj,
        weight: expertiseUSD * 0.5,
      });
    }

    // Update DB for this object
    await Wobj.updateOneWithArrayFilters({
      authorPermlink: rootWobj,
      updateData,
      arrayFilters,
    });
  };

  // Group by root_wobj and process all groups in parallel
  const groupedByObject = _.groupBy(votes, 'root_wobj');
  await Promise.all(
    Object.entries(groupedByObject)
      .map(([rootWobj, groupVotes]) => processRootWobjGroup(rootWobj, groupVotes)),
  );
};

const checkGuestPostReward = async (rewards) => {
  const beneficiaryRewards = _.filter(
    rewards,
    (reward) => reward.operation === COMMENTS_CONTRACT.BENEFICIARY_REWARD
            && reward.account === process.env.GUEST_BENEFICIARY_ACC,
  );

  for (const record of beneficiaryRewards) {
    if (!_.includes(Object.values(GUEST_AVAILABLE_TOKEN), record.symbol)) continue;

    const { post } = await Post.findOne({
      root_author: record.authorperm.split('/')[0].substring(1),
      permlink: record.authorperm.split('/')[1],
    });
    if (!post) continue;

    await GuestWallet.create({
      refHiveBlockNumber: record.refHiveBlockNumber,
      blockNumber: record.blockNumber,
      account: post.author,
      transactionId: record.transactionId,
      operation: GUEST_WALLET_TYPE.AUTHOR_REWARD,
      timestamp: record.timestamp,
      quantity: record.quantity,
      symbol: record.symbol,
      authorperm: `@${post.author}/${post.permlink}`,
    });
  }
};

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

const getRewardsUpdateData = ({
  post,
  rewardsOnPosts,
}) => _.reduce(rewardsOnPosts[`@${post.root_author}/${post.permlink}`], (acc, el, index) => {
  acc[`total_rewards_${index}`] = BigNumber(_.get(post, `total_rewards_${index}`, 0))
    .plus(el)
    .toNumber();
  return acc;
}, {});

const votesFormat = async (votesOps) => {
  let accounts = [];
  votesOps = _
    .chain(votesOps)
    .orderBy(['weight'], ['desc'])
    .uniqWith((first, second) => first.author === second.author
        && first.permlink === second.permlink && first.voter === second.voter)
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
  const votesToRemoveFromRedis = [];

  for (const vote of votes) {
    const post = _.find(
      posts,
      (p) => (p.author === vote.author || p.author === vote.guest_author)
                && p.permlink === vote.permlink,
    );
    const voteInPost = _.find(_.get(post, 'active_votes', []), (v) => v.voter === vote.voter);
    const processed = _.find(votesProcessedOnApi, (el) => _.isEqual(vote, el));
    if (processed) {
      votesToRemoveFromRedis.push(vote);
      continue;
    }
    if (!post) continue;
    const createdOverAWeek = moment().diff(moment(_.get(post, 'createdAt')), 'day') > 7;
    if (!createdOverAWeek) {
      post[`net_rshares_${vote.symbol}`] = getPostNetRshares({ post, vote, voteInPost });

      post[`total_payout_${vote.symbol}`] = BigNumber(post[`net_rshares_${vote.symbol}`])
        .times(rewards[vote.symbol])
        .toNumber();
    }
    voteInPost
      ? voteInPost[`rshares${vote.symbol}`] = vote.rshares
      : post.active_votes.push({
        voter: vote.voter,
        percent: vote.weight,
        [`rshares${vote.symbol}`]: vote.rshares,
      });
  }
  for (const removeVote of votesToRemoveFromRedis) {
    await redisSetter.zrem({
      key: REDIS_KEYS.PROCESSED_LIKES,
      member: `${removeVote.voter}:${removeVote.author}:${removeVote.permlink}`,
    });
  }
  await updatePostsRshares(posts);
  return { processedPosts: posts };
};

const getPostNetRshares = ({ vote, voteInPost, post }) => {
  if (voteInPost && vote.weight === 0) {
    return BigNumber(post[`net_rshares_${vote.symbol}`])
      .minus(_.get(voteInPost, `rshares${vote.symbol}`, 0))
      .toNumber();
  }
  if (voteInPost) {
    return BigNumber(post[`net_rshares_${vote.symbol}`])
      .minus(_.get(voteInPost, `rshares${vote.symbol}`, 0))
      .plus(vote.rshares)
      .toNumber();
  }
  return BigNumber(_.get(post, `net_rshares_${vote.symbol}`, 0))
    .plus(vote.rshares)
    .toNumber();
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
  const { users: blackList } = await appHelper.getBlackListUsers();
  for (const vote of votes) {
    const post = posts.find(
      (p) => (p.author === vote.author || p.author === vote.guest_author)
                && p.permlink === vote.permlink,
    );
    if (!post) continue;
    if (userValidator.validateUserOnBlacklist([vote.voter, post.author, vote.guest_author], blackList)) continue;

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

      const weightUsd = await calculateGeneralHiveExpertise(wobjectRshares);

      await updateExpertiseInDb({
        currentVote, wobjectRshares, post, wObject, weightUsd,
      });
    }
  }
};
const calculateGeneralHiveExpertise = async (wobjectRshares) => {
  let hiveExpertise = 0;
  for (const key in wobjectRshares) {
    hiveExpertise = BigNumber(hiveExpertise)
      .plus(await calculateEngineExpertise(wobjectRshares[key], key));
  }
  return hiveExpertise.toNumber();
};
const updateExpertiseInDb = async ({
  post, wObject, weightUsd,
}) => {
  const expertiseUsd = Number((weightUsd * 0.5).toFixed(8));
  if (expertiseUsd === 0 || expertiseUsd < 0) return;

  await Wobj.update(
    { author_permlink: wObject.author_permlink },
    { $inc: { weight: expertiseUsd } },
  );
  // post author can have negative expertise

  await User.updateOne(
    { name: post.author },
    {
      $inc: { wobjects_weight: expertiseUsd },
    },
  );
  await UserExpertiseModel.updateOne(
    { user_name: post.author, author_permlink: wObject.author_permlink },
    { $inc: { weight: expertiseUsd } },
    { upsert: true, setDefaultsOnInsert: true },
  );

  if (weightUsd < 0) {
    await User.updateOne(
      { name: post.author },
      { $max: { wobjects_weight: 0 } },
    );
    await UserExpertiseModel.updateOne(
      { user_name: post.author, author_permlink: wObject.author_permlink },
      { $max: { weight: 0 } },
    );
  }
};
