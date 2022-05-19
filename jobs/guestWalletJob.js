const cron = require('cron');
const _ = require('lodash');
const BigNumber = require('bignumber.js');
const { getTokenBalances, getTokensParams } = require('utilities/hiveEngine/tokensContract');
const { GUEST_AVAILABLE_TOKEN, SPECIAL_BENEFICIARIES_ARR } = require('constants/common');
const { ENGINE_CONTRACTS, TOKENS_CONTRACT } = require('constants/hiveEngine');
const { broadcastJson } = require('utilities/hiveApi/broadcastUtil');

exports.engineDistribution = cron.job('15 0 * * *', async () => {
  if (process.env.NODE_ENV !== 'production') return;
  await distributeTokens();
}, null, false, null, null, false);

const distributeTokens = async () => {
  const operations = [];
  const balances = await getTokenBalances({
    query: {
      symbol: { $in: Object.values(GUEST_AVAILABLE_TOKEN) },
      account: process.env.GUEST_BENEFICIARY_ACC,
    },
  });

  const tokens = await getTokensParams({
    query: {
      symbol: { $in: Object.values(GUEST_AVAILABLE_TOKEN) },
    },
  });

  for (const record of balances) {
    const tokenParams = _.find(tokens, (token) => token.symbol === record.symbol);
    const quantity = BigNumber(record.balance)
      .div(2)
      .toFixed(_.get(tokenParams, 'precision', 8), BigNumber.ROUND_DOWN);

    for (const account of SPECIAL_BENEFICIARIES_ARR) {
      operations.push(getTransferParams({ to: account, quantity, symbol: record.symbol }));
    }
  }
  if (_.isEmpty(operations)) return;

  await broadcastJson({
    json: JSON.stringify(operations),
    required_auths: [process.env.GUEST_BENEFICIARY_ACC],
    key: process.env.GUEST_BENEFICIARY_KEY,
  });
};

const getTransferParams = ({ quantity, to, symbol }) => ({
  contractName: ENGINE_CONTRACTS.TOKENS,
  contractAction: TOKENS_CONTRACT.TRANSFER,
  contractPayload: { symbol, to, quantity },
});
