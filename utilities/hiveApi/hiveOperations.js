const { COMMON_RPC_NODES } = require('constants/appData');
const { Client } = require('@hiveio/dhive');
const BigNumber = require('bignumber.js');

const client = new Client(COMMON_RPC_NODES, { failoverThreshold: 0, timeout: 10 * 1000 });

exports.calculateRcPercent = async (account) => {
  try {
    const rc = await client.rc.getRCMana(account);
    const percent = BigNumber(rc.percentage).times(0.01).toNumber();
    return { result: percent };
  } catch (error) {
    return { error };
  }
};
