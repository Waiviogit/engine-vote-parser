const { tokensContract, commentContract } = require('utilities/hiveEngine');
const {
  Post, Wobj, User, UserWobjects,
} = require('models');
const { commentRefGetter } = require('utilities/commentRefService');
const { ENGINE_TOKENS, CACHE_POOL_KEY } = require('constants/hiveEngine');
const moment = require('moment');
const redisGetter = require('utilities/redis/redisGetter');
const { lastBlockClient } = require('utilities/redis/redis');
const _ = require('lodash');

exports.parse = async (votes) => {
  if (_.isEmpty(votes)) return console.log('Parsed votes: 0');
  const formattedVotes = await votesFormat(votes);
  const { posts = [] } = await Post.getManyPosts(
    _.chain(formattedVotes)
      .filter((v) => !!v.type)
      .uniqWith((x, y) => x.author === y.author && x.permlink === y.permlink)
      .map((v) => ({ author: v.guest_author || v.author, permlink: v.permlink }))
      .value(),
  );
  await parseEngineVotes({ votes: formattedVotes, posts });
  console.log(`Parsed votes: ${formattedVotes.length}`);
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

const addRharesToPostsAndVotes = async ({
  votes, posts, balances, votingPowers, tokenSymbol,
}) => {
  for (const vote of votes) {
    if (!vote.type) continue;
    const { rewards } = await redisGetter.getHashAll(
      `${CACHE_POOL_KEY}:${tokenSymbol}`,
      lastBlockClient,
    );
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
