const _ = require('lodash');
const { parseJson } = require('utilities/helpers/jsonHelper');
const { ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const { sendNotification } = require('../utilities/notificationsApi/notificationsUtil');

exports.parse = async (transaction, blockNumber) => {
  const payload = parseJson(_.get(transaction, 'payload'));
  if (_.isEmpty(payload)) return;

  const getData = (action) => {
    switch (action) {
      case ENGINE_CONTRACT_ACTIONS.DELEGATE:
      case ENGINE_CONTRACT_ACTIONS.TRANSFER:
      case ENGINE_CONTRACT_ACTIONS.UNDELEGATE:
        return {
          from: _.get(transaction, 'sender'),
          to: _.get(payload, 'to'),
          amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
          memo: _.get(payload, 'memo') ? _.get(payload, 'memo') : '',
        };
      case ENGINE_CONTRACT_ACTIONS.STAKE:
      case ENGINE_CONTRACT_ACTIONS.UNSTAKE:
        return {
          amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
          account: _.get(payload, 'to'),
        };
      default:
        return {};
    }
  };
  const data = getData(_.get(transaction, 'action'));
  if (_.isEmpty(data)) return;
  const reqData = {
    id: transaction.action,
    block: blockNumber,
    data,
  };
  await sendNotification(reqData);
};
