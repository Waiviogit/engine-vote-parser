const _ = require('lodash');
const { parseJson } = require('utilities/helpers/jsonHelper');
const { ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const { sendNotification } = require('../utilities/notificationsApi/notificationsUtil');

const getRequestData = async (transaction, blockNumber) => {
  const payload = parseJson(_.get(transaction, 'payload'));
  const action = _.get(transaction, 'action');
  if (_.isEmpty(payload)) return;

  switch (action) {
    case ENGINE_CONTRACT_ACTIONS.DELEGATE:
      return {
        id: action,
        block: blockNumber,
        data: {
          from: _.get(transaction, 'sender'),
          to: _.get(payload, 'to'),
          amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
        },
      };
    case ENGINE_CONTRACT_ACTIONS.TRANSFER:
      return {
        id: action,
        block: blockNumber,
        data: {
          from: _.get(transaction, 'sender'),
          to: _.get(payload, 'to'),
          amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
          memo: _.get(payload, 'memo'),
        },
      };
    case ENGINE_CONTRACT_ACTIONS.UNDELEGATE:
      return {
        id: action,
        block: blockNumber,
        data: {
          from: _.get(transaction, 'sender'),
          to: _.get(payload, 'from'),
          amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
        },
      };
    case ENGINE_CONTRACT_ACTIONS.STAKE:
    case ENGINE_CONTRACT_ACTIONS.UNSTAKE:
      return {
        id: action,
        block: blockNumber,
        data: {
          amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
          to: _.get(payload, 'to'),
          from: _.get(payload, 'to'),
        },
      };
    default:
      return {};
  }
};

exports.parse = async (transaction, blockNumber) => {
  const requestData = await getRequestData(transaction, blockNumber);
  if (_.isEmpty(requestData)) return;
  await sendNotification(requestData);
};
