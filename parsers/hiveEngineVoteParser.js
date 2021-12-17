const { tokensContract, commentContract } = require('utilities/hiveEngine');
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
  const { votes, rewards } = formatVotesAndRewards({ transactions, blockNumber, timestamps });

  await processRewards(rewards, blockNumber);
  // if (_.isEmpty(votes)) return console.log('Parsed votes: 0');
  // const formattedVotes = await votesFormat(votes);
  // const { posts = [] } = await Post.getManyPosts(
  //   _.chain(formattedVotes)
  //     .filter((v) => !!v.type)
  //     .uniqWith((x, y) => x.author === y.author && x.permlink === y.permlink)
  //     .map((v) => ({ author: v.guest_author || v.author, permlink: v.permlink }))
  //     .value(),
  // );
  // await parseEngineVotes({ votes: formattedVotes, posts });
  // console.log(`Parsed votes: ${formattedVotes.length}`);
};

const formatVotesAndRewards = ({ transactions, blockNumber, timestamps }) => _.reduce(
  transactions, (acc, transaction) => {
    const events = _.get(jsonHelper.parseJson(transaction.logs), 'events', []);
    if (_.isEmpty(events)
    && !_.some(events, (e) => _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(e, 'data.symbol')))
    ) {
      return acc;
    }
    for (const event of events) {
      if (_.get(event, 'event') === ENGINE_EVENTS.NEW_VOTE
      && _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(event, 'data.symbol'))
      && parseFloat(_.get(event, 'data.rshares')) !== 0
      ) {
        acc.votes.push({
          ...jsonHelper.parseJson(transaction.payload),
          rshares: parseFloat(_.get(event, 'data.rshares')),
          symbol: _.get(event, 'data.symbol'),
        });
      }
      if (_.includes(POST_REWARD_EVENTS, _.get(event, 'event'))
        && _.includes(_.map(ENGINE_TOKENS, 'SYMBOL'), _.get(event, 'data.symbol'))
        && parseFloat(_.get(event, 'data.quantity')) !== 0
      ) {
        acc.rewards.push({
          operation: `${transaction.contract}_${event.event}`,
          ...event.data,
          blockNumber,
          refHiveBlockNumber: transaction.refHiveBlockNumber,
          transactionId: transaction.transactionId,
          timestamps: moment(timestamps).unix(),
        });
      }
    }
    return acc;
  }, { votes: [], rewards: [] },
);
const kek = {};

const processRewards = async (rewards, blockNumber) => {
  if (_.isEmpty(rewards)) return;
  // await EngineAccountHistoryModel.insertMany(rewards);
  const rewardsOnPosts = _.reduce(rewards, (acc, reward) => {
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
  for (const test in rewardsOnPosts) {
    if (_.has(kek, test)) {
      console.log();
    }
  }
  Object.assign(kek, rewardsOnPosts);

  for (const rewardsOnPostsKey in rewardsOnPosts) {
    const [author, permlink] = rewardsOnPostsKey.split('/');
    // const rewardsUpdateData = _.reduce(rewardsOnPosts[rewardsOnPostsKey], (acc, el, index) => {
    //   acc[`total_payout_${index}`] = el.toNumber();
    //   return acc;
    // }, {});
    const rewardsUpdateData = rewardsOnPosts[rewardsOnPostsKey];
    await Post.updateOne(
      {
        root_author: author.substring(1),
        permlink,
      },
      rewardsUpdateData,
    );
  }
};

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

const parseEngineVotes = async ({ votes, posts }) => {
  for (const TOKEN of ENGINE_TOKENS) {
    const {
      filteredPosts, filteredVotes, balances, votingPowers,
    } = await getBalancesAndFilterVotes({ TOKEN, posts, votes });
    if (_.isEmpty(balances)) continue;
    const { calcPosts, calcVotes } = await addRharesToPostsAndVotes({
      votes: filteredVotes,
      posts: filteredPosts,
      balances,
      votingPowers,
      tokenSymbol: TOKEN.SYMBOL,
    });
    await updatePostsRshares({ posts: calcPosts, tokenSymbol: TOKEN.SYMBOL });
    await distributeHiveEngineExpertise({ calcVotes, calcPosts, tokenSymbol: TOKEN.SYMBOL });
  }
};

const getBalancesAndFilterVotes = async ({ TOKEN, posts, votes }) => {
  const filteredPosts = _.filter(
    posts,
    (el) => _.some(
      _.map(el.wobjects, 'author_permlink'),
      (item) => _.includes(TOKEN.TAGS, item),
    ),
  );
  const filteredVotes = _.filter(
    votes,
    (el) => _.some(
      filteredPosts,
      (item) => el.author === item.root_author && el.permlink === item.permlink,
    ),
  );
  const balances = await tokensContract.getTokenBalances({
    query: {
      symbol: TOKEN.SYMBOL, account: { $in: _.map(filteredVotes, 'voter') },
    },
  });
  // for some reason not work with operator $in
  const votingPowers = await commentContract.getVotingPower({
    query: {
      rewardPoolId: TOKEN.POOL_ID, $or: _.map(filteredVotes, (v) => ({ account: v.voter })),
    },
  });

  return {
    filteredPosts, filteredVotes, balances, votingPowers,
  };
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

const addRharesToPostsAndVotes = async ({
  votes, posts, balances, votingPowers, tokenSymbol,
}) => {
  const votesProcessedOnApi = await getProcessedVotes(votes);
  const { rewards } = await redisGetter.getHashAll(
    `${CACHE_POOL_KEY}:${tokenSymbol}`,
    lastBlockClient,
  );

  for (const vote of votes) {
    if (!vote.type) continue;
    const processed = _.find(votesProcessedOnApi, (el) => _.isEqual(vote, el));
    if (processed) continue;
    const balance = _.find(balances, (el) => el.account === vote.voter);
    const powerBalance = _.find(votingPowers, (el) => el.account === vote.voter);
    const post = _.find(posts, (p) => (p.author === vote.author || p.author === vote.guest_author) && p.permlink === vote.permlink);
    const createdOverAWeek = moment().diff(moment(_.get(post, 'createdAt')), 'day') > 7;

    if (!balance || !powerBalance || !post) continue;

    const decreasedPercent = (((vote.weight / 100) * 2) / 100);
    const { stake, delegationsIn } = balance;
    const { votingPower } = powerBalance;
    const previousVotingPower = (100 * votingPower) / (100 - decreasedPercent);

    const finalRshares = parseFloat(stake) + parseFloat(delegationsIn);
    const power = (previousVotingPower * vote.weight) / 10000;

    const rshares = !createdOverAWeek
      ? (power * finalRshares) / 10000
      : 1;

    if (!createdOverAWeek) {
      post[`net_rshares_${tokenSymbol}`] = _.get(post, `net_rshares_${tokenSymbol}`, 0) + rshares;
      post[`total_payout_${tokenSymbol}`] = post[`net_rshares_${tokenSymbol}`] * parseFloat(rewards);
    }

    const voteInPost = _.find(post.active_votes, (v) => v.voter === vote.voter);
    voteInPost
      ? voteInPost[`rshares${tokenSymbol}`] = rshares
      : post.active_votes.push({
        voter: vote.voter,
        percent: vote.weight,
        [`rshares${tokenSymbol}`]: rshares,
      });
  }
  return { calcPosts: posts, calcVotes: votes };
};

const updatePostsRshares = async ({ posts, tokenSymbol }) => {
  for (const post of posts) {
    await Post.updateOne(
      { author: post.author, permlink: post.permlink },
      {
        [`net_rshares_${tokenSymbol}`]: post[`net_rshares_${tokenSymbol}`],
        active_votes: post.active_votes,
        [`total_payout_${tokenSymbol}`]: post[`total_payout_${tokenSymbol}`],
      },
    );
  }
};

const distributeHiveEngineExpertise = async ({ calcVotes, calcPosts, tokenSymbol }) => {
  for (const vote of calcVotes) {
    const post = calcPosts.find(
      (p) => (p.author === vote.author || p.author === vote.guest_author)
        && p.permlink === vote.permlink,
    );
    if (!post) continue;
    const currentVote = post.active_votes.find((v) => v.voter === vote.voter);
    if (!currentVote || !currentVote[`rshares${tokenSymbol}`]) continue;

    for (const wObject of _.get(post, 'wobjects', [])) {
      const wobjectRshares = Number((currentVote[`rshares${tokenSymbol}`] * (wObject.percent / 100)).toFixed(3));
      await updateExpertiseInDb({
        currentVote, wobjectRshares, post, tokenSymbol, wObject,
      });
    }
  }
};

const updateExpertiseInDb = async ({
  currentVote, wobjectRshares, post, tokenSymbol, wObject,
}) => {
  // object and voter expertise always positive
  await Wobj.update(
    { author_permlink: wObject.author_permlink },
    { $inc: { [`expertise${tokenSymbol}`]: Math.abs(wobjectRshares) } },
  );
  await User.updateOne(
    { name: currentVote.voter },
    { $inc: { [`expertise${tokenSymbol}`]: Math.abs(wobjectRshares / 2) } },
  );
  await UserWobjects.updateOne(
    { user_name: currentVote.voter, author_permlink: wObject.author_permlink },
    { $inc: { [`expertise${tokenSymbol}`]: Math.abs(wobjectRshares / 2) } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  // post author can have negative expertise
  await User.updateOne(
    { name: post.author },
    { $inc: { [`expertise${tokenSymbol}`]: wobjectRshares / 2 } },
  );
  await UserWobjects.updateOne(
    { user_name: post.author, author_permlink: wObject.author_permlink },
    { $inc: { [`expertise${tokenSymbol}`]: wobjectRshares / 2 } },
    { upsert: true, setDefaultsOnInsert: true },
  );
};
