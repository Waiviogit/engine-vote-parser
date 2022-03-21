const _ = require('lodash');
const { sinon } = require('test/testHelper');
const BigNumber = require('bignumber.js');
const { expect } = require('../../testHelper');
const { redisGetter } = require('../../../utilities/redis');
const calculateEngineExpertise = require('../../../utilities/bookBot/helpers/calculateEngineExpertise');

describe('Calculate Engine Expertise', async () => {
  let value, check;
  before(async () => {
    const reward_fund = {
      recent_claims: _.random(100000, 200000),
      reward_balance: `${_.random(100000, 200000)} HIVE`,
    };
    const current_median_history = {
      base: `${_.random(1.0, 1.6)} HBD`,
    };
    const smt_pool = {
      rewards: _.random(0.00001, 0.00005),
    };
    const market_pool = {
      quotePrice: _.random(0.1, 0.2),
    };

    const callback = sinon.stub(redisGetter, 'getHashAll');
    callback.onCall(0).returns(reward_fund);
    callback.onCall(1).returns(current_median_history);
    callback.onCall(2).returns(smt_pool);
    callback.onCall(3).returns(market_pool);

    const WAIVExpertise = _.random(1000, 20000);
    const res = await calculateEngineExpertise(WAIVExpertise, 'sampleToken');

    value = BigNumber(BigNumber(res).div(reward_fund.recent_claims).toNumber)
      .multipliedBy(reward_fund.reward_balance.replace(' HIVE', ''))
      .multipliedBy(current_median_history.base.replace(' HBD', ''))
      .multipliedBy(1000000)
      .toNumber();

    const price = BigNumber(parseFloat(market_pool.quotePrice)).multipliedBy(parseFloat(current_median_history.base.replace(' HBD', ''))).toNumber();
    check = BigNumber(WAIVExpertise).multipliedBy(price).multipliedBy(smt_pool.rewards).toNumber();
  });
  it('should equal', () => {
    expect(value).to.deep.eq(check);
  });
});
