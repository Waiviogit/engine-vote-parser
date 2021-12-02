const _ = require('lodash');
const { EngineAccountHistory } = require('models');
const { parseJson } = require('utilities/helpers/jsonHelper');
const moment = require('moment');
const { ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');

exports.parse = async (transaction, blockNumber, timestamp) => {
  if (transaction.action !== ENGINE_CONTRACT_ACTIONS.SWAP_TOKENS) return;

  const log = parseJson(_.get(transaction, 'logs'));
  if (_.isEmpty(log) || _.has(log, 'errors')) return;

  const swapTo = _.find(log.events, (e) => e.event === 'transferFromContract');
  const swapFrom = _.find(log.events, (e) => e.event === 'transferToContract');
  const symbols = _.find(log.events, (e) => e.event === 'swapTokens');

  /*
  *    check to include only wive transactions
  * */
  if (!_.includes(symbols.data.symbolOut, 'WAIV') && !_.includes(symbols.data.symbolIn, 'WAIV')) return;


  if (!swapTo || !swapFrom || !symbols) return;

  const data = {
    blockNumber,
    transactionId: transaction.transactionId,
    account: transaction.sender,
    operation: transaction.action,
    refHiveBlockNumber: transaction.refHiveBlockNumber,
    symbolOut: _.get(symbols, 'data.symbolOut'),
    symbolOutQuantity: _.get(swapTo, 'data.quantity'),
    symbolIn: _.get(symbols, 'data.symbolIn'),
    symbolInQuantity: _.get(swapFrom, 'data.quantity'),
    timestamp: moment(timestamp).unix(),

  };

  await EngineAccountHistory.create(data);
};
