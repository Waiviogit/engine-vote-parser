const { COMMON_RPC_NODES } = require('constants/appData');
const { Client } = require('@hiveio/dhive');
const BigNumber = require('bignumber.js');

const client = new Client(COMMON_RPC_NODES, { failoverThreshold: 0, timeout: 10 * 1000 });

const parseToFloat = (balance) => parseFloat(balance.match(/.\d*.\d*/)[0]);

exports.calculateRcPercent = async (account) => {
  try {
    const rc = await client.rc.getRCMana(account);
    const percent = BigNumber(rc.percentage).times(0.01).toNumber();
    return { result: percent };
  } catch (error) {
    return { error };
  }
};

exports.getCurrentPriceInfo = async () => {
  try {
    const sbdMedian = await client.database.call('get_current_median_history_price', []);
    const rewardFund = await client.database.call('get_reward_fund', ['post']);
    return {
      currentPrice: parseToFloat(sbdMedian.base) / parseToFloat(sbdMedian.quote),
      rewardFund,
    };
  } catch (error) {
    return { error };
  }
};
