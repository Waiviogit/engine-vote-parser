const _ = require('lodash');
const { AccountHistory } = require('models');
const { parseJson } = require('utilities/helpers/jsonHelper');
const moment = require('moment');

exports.parse = async (transactions, blockNumber, timestamp) => {
  const filtered = _.filter(transactions, (el) => el.contract === 'marketpools' && el.action === 'swapTokens');
  if (filtered.length > 0) {
    for (const element of filtered) {
      const log = parseJson(_.get(element, 'logs'));
      if (_.isEmpty(log)) continue;

      const swapTo = _.find(log.events, (e) => e.event === 'transferFromContract');
      const swapFrom = _.find(log.events, (e) => e.event === 'transferToContract');
      const symbols = _.find(log.events, (e) => e.event === 'swapTokens');

      const data = {
        blockNumber,
        transactionId: element.transactionId,
        account: element.sender,
        operation: element.action,
        refHiveBlockNumber: element.refHiveBlockNumber,
        symbolOut: _.get(symbols, 'data.symbolOut'),
        symbolOutQuantity: _.get(swapTo, 'data.quantity'),
        symbolIn: _.get(symbols, 'data.symbolIn'),
        symbolInQuantity: _.get(swapFrom, 'data.quantity'),
        timestamp: moment(timestamp).unix(),

      };

      AccountHistory.create(data);
    }
  }
};
