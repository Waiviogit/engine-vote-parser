const { Client, PrivateKey } = require('@hiveio/dhive');
const { COMMON_RPC_NODES } = require('constants/appData');

const client = new Client(COMMON_RPC_NODES, { failoverThreshold: 0, timeout: 10 * 1000 });

exports.broadcastJson = async ({
  id = 'ssc-mainnet-hive',
  json,
  key,
  required_auths = [],
  required_posting_auths = [],
}) => {
  try {
    return {
      result: await client.broadcast.json({
        id,
        json,
        required_auths,
        required_posting_auths,
      },
      PrivateKey.fromString(key)),
    };
  } catch (error) {
    console.error(error.message);
    return { error };
  }
};
