const _ = require('lodash');
const { EngineAccountHistory } = require('models');
const { parseJson } = require('utilities/helpers/jsonHelper');
const moment = require('moment');
const { ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const { BOOK_BOTS } = require('constants/bookBot');
const bookBot = require('utilities/bookBot/bookBot');

exports.parse = async (transaction, blockNumber, timestamp) => {
  if (transaction.action !== ENGINE_CONTRACT_ACTIONS.SWAP_TOKENS) return;

  const log = parseJson(_.get(transaction, 'logs'));
  const payload = parseJson(_.get(transaction, 'payload'));
  if (_.isEmpty(log) || _.has(log, 'errors')) return;

  const hasBookPools = _.includes(_.map(BOOK_BOTS, 'tokenPair'), _.get(payload, 'tokenPair'));

  const swapTo = _.find(log.events, (e) => e.event === 'transferFromContract');
  const swapFrom = _.find(log.events, (e) => e.event === 'transferToContract');
  const symbols = _.find(log.events, (e) => e.event === 'swapTokens');

  const symbolOut = _.get(symbols, 'data.symbolOut');
  const symbolIn = _.get(symbols, 'data.symbolIn');

  if (hasBookPools) {
    const bookSymbol = symbolOut === 'SWAP.HIVE' ? symbolIn : symbolOut;
    await bookBot.sendBookEvent({ symbol: bookSymbol });
  }

  /*
*    check to include only WAIV transactions
* */

  if (symbolOut !== 'WAIV' && symbolIn !== 'WAIV') return;

  if (!swapTo || !swapFrom || !symbols) return;
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

  await EngineAccountHistory.create(data);
};
