const _ = require('lodash');
const { parseJson } = require('utilities/helpers/jsonHelper');
const moment = require('moment');
const { sendNotification } = require('../utilities/notificationsApi/notificationsUtil');

exports.parse = async (transaction, blockNumber, timestamps) => {
  if (transaction.action !== 'transfer') return;
  const payload = parseJson(_.get(transaction, 'payload'));
  if (_.isEmpty(payload)) return;

  // console.log(_.get(transaction, 'payload'));
  const reqData = {
    id: transaction.action,
    block: blockNumber,
    data: {
      from: transaction.sender,
      to: _.get(payload, 'to'),
      amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
      memo: _.get(payload, 'memo'),
      timestamp: moment(timestamps).unix(),
    },
  };
  sendNotification(reqData);
};
