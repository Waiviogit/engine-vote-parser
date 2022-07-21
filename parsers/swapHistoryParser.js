const _ = require('lodash');
const { EngineAccountHistory } = require('models');
const { parseJson } = require('utilities/helpers/jsonHelper');
const moment = require('moment');
const { ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const { BALANCE_BEFORE_REBALANCING } = require('../constants/parsersData');

exports.parse = async (transaction, blockNumber, timestamp) => {
  if (transaction.action !== ENGINE_CONTRACT_ACTIONS.SWAP_TOKENS) return;

  const log = parseJson(_.get(transaction, 'logs'));
  if (_.isEmpty(log) || _.has(log, 'errors')) return;
  const swapTo = _.find(log.events, (e) => e.event === 'transferFromContract');
  const swapFrom = _.find(log.events, (e) => e.event === 'transferToContract');
  const symbols = _.find(log.events, (e) => e.event === 'swapTokens');

  const symbolOut = _.get(symbols, 'data.symbolOut');
  const symbolIn = _.get(symbols, 'data.symbolIn');

  if (!swapTo || !swapFrom || !symbols) return;

  const dataToSave = [];
  const data = {
    blockNumber,
    transactionId: transaction.transactionId,
    account: transaction.sender,
    operation: `${transaction.contract}_${transaction.action}`,
    refHiveBlockNumber: transaction.refHiveBlockNumber,
    symbolOut,
    symbolIn,
    symbolOutQuantity: _.get(swapTo, 'data.quantity'),
    symbolInQuantity: _.get(swapFrom, 'data.quantity'),
    timestamp: moment(timestamp).unix(),
  };
  dataToSave.push(data);

  const payload = parseJson(transaction.payload);
  if (payload.balances) {
    dataToSave.push(...prepareBalancesBeforeRebalancingToSave({
      transaction,
      timestamp,
      blockNumber,
      balances: payload.balances,
    }));
  }
  await EngineAccountHistory.insertMany(dataToSave);
};

const prepareBalancesBeforeRebalancingToSave = ({ transaction, timestamp, blockNumber, balances }) => {
  const dataToSave = [];
  const [base, quote] = balances.dbField.split('_');
  for (const symbol of [base, quote]) {
    symbol === base ? dataToSave.push({
      account: transaction.sender,
      timestamp: moment(timestamp).unix(),
      blockNumber,
      refHiveBlockNumber: transaction.refHiveBlockNumber,
      transactionId: transaction.transactionId,
      dbField: balances.dbField,
      quantity: balances.base,
      symbol: base,
      operation: BALANCE_BEFORE_REBALANCING,
    }) : dataToSave.push({
      account: transaction.sender,
      timestamp: moment(timestamp).unix(),
      blockNumber,
      refHiveBlockNumber: transaction.refHiveBlockNumber,
      transactionId: transaction.transactionId.replace('-0', '-1'),
      dbField: balances.dbField,
      quantity: balances.quote,
      symbol: quote,
      operation: BALANCE_BEFORE_REBALANCING,
    });
  }

  return dataToSave;
};
