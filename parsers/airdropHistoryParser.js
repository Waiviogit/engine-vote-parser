const _ = require('lodash');
const { parseJson } = require('utilities/helpers/jsonHelper');
const moment = require('moment');
const { ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const { EngineAccountHistory } = require('../models');

exports.parse = async (transaction, blockNumber, timestamp) => {
  if (transaction.action !== ENGINE_CONTRACT_ACTIONS.NEW_AIRDROP) return;

  const payload = parseJson(_.get(transaction, 'payload'));
  if (_.isEmpty(payload)) return;

  /*
    *    check to include only WAIV transactions
    * */
  if (payload.symbol !== 'WAIV') return;

  for (const el of payload.list) {
    if (!(el[0] && el[1])) continue;
    const data = {
      refHiveBlockNumber: transaction.refHiveBlockNumber,
      blockNumber,
      account: el[0],
      operation: `${transaction.contract}_${transaction.action}`,
      transactionId: transaction.transactionId,
      quantity: el[1],
      tokenState: payload.type,
      timestamp: moment(timestamp).unix(),
      symbol: payload.symbol,
    };
    await EngineAccountHistory.create(data);
  }
};
