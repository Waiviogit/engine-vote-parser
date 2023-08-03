const _ = require('lodash');
const commentContract = require('utilities/hiveEngine/commentContract');
const marketPools = require('utilities/hiveEngine/marketPools');
const tokensContract = require('utilities/hiveEngine/tokensContract');
const {
  MAX_VOTING_POWER, VOTE_REGENERATION_DAYS, DOWNVOTE_REGENERATION_DAYS, CACHE_POOL_KEY,
} = require('../../constants/hiveEngine');
const { redisGetter } = require('../redis');
const { lastBlockClient } = require('../redis/redis');
const { CACHE_KEY } = require('../../constants/hiveConstants');

exports.calculateMana = (
  votingPower = { votingPower: MAX_VOTING_POWER, downvotingPower: MAX_VOTING_POWER, lastVoteTimestamp: Date.now() },
) => {
  const timestamp = new Date().getTime();
  const result = {
    votingPower: votingPower.votingPower,
    downvotingPower: votingPower.downvotingPower,
    lastVoteTimestamp: votingPower.lastVoteTimestamp,
  };

  result.votingPower += ((timestamp - result.lastVoteTimestamp) * MAX_VOTING_POWER)
        / (VOTE_REGENERATION_DAYS * 24 * 3600 * 1000);
  result.votingPower = Math.floor(result.votingPower);
  result.votingPower = Math.min(result.votingPower, MAX_VOTING_POWER);

  result.downvotingPower += ((timestamp - result.lastVoteTimestamp) * MAX_VOTING_POWER)
        / (DOWNVOTE_REGENERATION_DAYS * 24 * 3600 * 1000);
  result.downvotingPower = Math.floor(result.downvotingPower);
  result.downvotingPower = Math.min(result.downvotingPower, MAX_VOTING_POWER);
  return result;
};

exports.calculateHiveEngineVote = async ({
  symbol, account, poolId, weight, dieselPoolId,
}) => {
  const { rewards } = await redisGetter.getHashAll(`${CACHE_POOL_KEY}:${symbol}`, lastBlockClient);

  const requests = await Promise.all([
    commentContract.getVotingPower({ query: { rewardPoolId: poolId, account } }),
    marketPools.getMarketPools({ query: { _id: dieselPoolId } }),
    tokensContract.getTokenBalances({ query: { symbol, account } }),
    redisGetter.getHashAll(CACHE_KEY.CURRENT_PRICE_INFO, lastBlockClient),
  ]);

  for (const req of requests) {
    if (_.has(req, 'error') || _.isEmpty(req)) {
      return { engineVotePrice: 0, rshares: 0, rewards };
    }
  }
  const [votingPowers, dieselPools, balances, hiveCurrency] = requests;
  const { stake, delegationsIn } = balances[0];
  const { votingPower } = this.calculateMana(votingPowers[0]);
  const { quotePrice } = dieselPools[0];

  const finalRshares = parseFloat(stake) + parseFloat(delegationsIn);
  const power = (votingPower * weight) / 10000;

  const rshares = (power * finalRshares) / 10000;
  // we calculate price in hbd cent for usd multiply quotePrice hiveCurrency.usdCurrency
  const price = parseFloat(quotePrice) * (parseFloat(_.get(hiveCurrency, 'base', '0'))
      / parseFloat(_.get(hiveCurrency, 'quote', '0')));

  const engineVotePrice = rshares * price * rewards;
  return { engineVotePrice, rshares, rewards };
};
