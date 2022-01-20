const _ = require('lodash');
const { sinon } = require('test/testHelper');
const { expect } = require('../../testHelper');
const { redisGetter } = require('../../../utilities/redis');
const calculateEngineExpertise = require('../../../utilities/helpers/calculateEngineExpertise');

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
    const quote_price = {
      WAIV: _.random(0.1, 0.2),
    };

    const callback = sinon.stub(redisGetter, 'getHashAll');
    callback.onCall(0).returns(reward_fund);
    callback.onCall(1).returns(current_median_history);
    callback.onCall(2).returns(smt_pool);
    callback.onCall(3).returns(quote_price);

    const WAIVExpertise = _.random(1000, 20000);
    const res = await calculateEngineExpertise(WAIVExpertise, 'expertiseWAIV');

    value = (res / reward_fund.recent_claims) * reward_fund.reward_balance.replace(' HIVE', '') * current_median_history.base.replace(' HBD', '') * 1000000;

    const price = parseFloat(quote_price.WAIV) * parseFloat(current_median_history.base.replace(' HBD', ''));
    check = WAIVExpertise * price * smt_pool.rewards;
  });
  it('should equal', () => {
    expect(value.toFixed(5)).to.deep.eq(check.toFixed(5));
  });
});
