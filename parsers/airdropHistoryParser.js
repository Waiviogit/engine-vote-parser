const _ = require('lodash');
const { AccountHistory } = require('models');
const { parseJson } = require('utilities/helpers/jsonHelper');
const moment = require('moment');

exports.parse = async (transactions, blockNumber, timestamps) => {
  const filtered = _.filter(transactions, (el) => el.contract === 'airdrops' && el.action === 'newAirdrop');
  if (filtered.length > 0) {
    for (const element of filtered) {
      const log = parseJson(_.get(element, 'logs'));
      if (_.isEmpty(log)) continue;

      const payload = parseJson(_.get(element, 'payload'));

      if (_.isEmpty(payload)) continue;
      if (_.has(payload, 'errors')) continue;

      for (const el of payload.list) {
        if (el[0] && el[1]) {
          const data = {
            refHiveBlockNumber: element.refHiveBlockNumber,
            blockNumber,
            account: el[0],
            operation: element.action,
            transactionId: element.transactionId,
            quantity: el[1],
            tokenState: payload.type,
            timestamp: moment(timestamps).unix(),
            symbol: payload.symbol,
          };
          AccountHistory.create(data);
        }
      }
    }
  }
};
