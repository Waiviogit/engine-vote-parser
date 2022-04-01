const _ = require('lodash');
const { parseJson } = require('utilities/helpers/jsonHelper');
const { ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const { sendNotification } = require('../utilities/notificationsApi/notificationsUtil');

const getRequestData = (transaction, blockNumber) => {
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
          memo: makeMemoString(_.get(payload, 'memo')),
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
      return {
        id: action,
        block: blockNumber,
        data: {
          amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
          to: _.get(payload, 'to'),
          from: _.get(payload, 'to'),
        },
      };
    case ENGINE_CONTRACT_ACTIONS.UNSTAKE:
      return {
        id: action,
        block: blockNumber,
        data: {
          amount: `${_.get(payload, 'quantity')} ${_.get(payload, 'symbol')}`,
          to: _.get(transaction, 'sender'),
          from: _.get(transaction, 'sender'),
        },
      };
    case ENGINE_CONTRACT_ACTIONS.CANCEL_UNSTAKE:
      const logs = parseJson(_.get(transaction, 'logs'));
      if (_.isEmpty(logs)) return;
      const eventsData = _.get(logs, 'events.[0].data');

      return {
        id: action,
        block: blockNumber,
        data: {
          amount: `${_.get(eventsData, 'quantity')} ${_.get(eventsData, 'symbol')}`,
          account: _.get(transaction, 'sender'),
        },
      };
    default:
      return {};
  }
};

const makeMemoString = (data) => {
  if (!data) return '';

  if (typeof data !== 'string') return data.toString();
};

exports.parse = async (transaction, blockNumber) => {
  const requestData = getRequestData(transaction, blockNumber);
  if (_.isEmpty(requestData)) return;

  sendNotification(requestData);
};
