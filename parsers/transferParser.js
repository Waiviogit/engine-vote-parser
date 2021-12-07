const _ = require('lodash');
const { parseJson } = require('utilities/helpers/jsonHelper');
const { sendNotification } = require('../utilities/notificationsApi/notificationsUtil');

exports.parse = async (transaction, blockNumber) => {
  if (_.get(transaction, 'action') !== 'transfer') return;
  const payload = parseJson(_.get(transaction, 'payload'));
  if (_.isEmpty(payload)) return;

  const reqData = {
    id: transaction.action,
    block: blockNumber,
    data: {
      from: _.get(transaction, 'sender'),
      to: _.get(payload, 'to'),
      amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
      memo: _.get(payload, 'memo'),
    },
  };
  sendNotification(reqData);
};
