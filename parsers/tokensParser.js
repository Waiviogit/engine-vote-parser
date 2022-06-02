const _ = require('lodash');
const { parseJson } = require('utilities/helpers/jsonHelper');
const { ENGINE_CONTRACT_ACTIONS } = require('constants/hiveEngine');
const { GUEST_TRANSFER_TYPE } = require('constants/common');
const {
  GuestWallet,
} = require('models');
const moment = require('moment');
const { sendNotification, sendSocketNotification } = require('../utilities/notificationsApi/notificationsUtil');
const { GUEST_WALLET_TYPE } = require('../constants/common');

const getRequestData = (transaction, blockNumber) => {
  const payload = parseJson(_.get(transaction, 'payload'));
  const action = _.get(transaction, 'action');
  const logs = parseJson(_.get(transaction, 'logs'));
  if (_.isEmpty(payload) || logs.errors) return;

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

  if (typeof data !== 'string') return JSON.stringify(data);
};

const parseTransfer = async (transaction, blockNumber, timestamp) => {
  const payload = parseJson(_.get(transaction, 'payload'));
  const logs = parseJson(_.get(transaction, 'logs'));
  if (_.isEmpty(payload) || logs.errors) return;
  const memoJson = parseJson(payload.memo);
  if (!_.has(memoJson, 'id')) return;
  switch (memoJson.id) {
    case GUEST_TRANSFER_TYPE.TO_GUEST:
    case GUEST_TRANSFER_TYPE.FROM_GUEST:
    case GUEST_TRANSFER_TYPE.GUEST_CAMPAIGN_REWARD:
      await parseGuestTransfer({
        transaction, payload, memo: memoJson, blockNumber, timestamp,
      });
      break;
  }
};

const parseGuestTransfer = async ({
  transaction, payload, memo, blockNumber, timestamp,
}) => {
  if (!_.includes([transaction.sender, payload.to], process.env.GUEST_HOT_ACC)) return;
  const to = memo.id === GUEST_TRANSFER_TYPE.FROM_GUEST
    ? payload.to
    : memo.to;

  const from = memo.id === GUEST_TRANSFER_TYPE.FROM_GUEST
    ? memo.from
    : transaction.sender;

  const account = GUEST_TRANSFER_TYPE.FROM_GUEST ? from : to;

  await GuestWallet.create({
    refHiveBlockNumber: transaction.refHiveBlockNumber,
    blockNumber,
    account,
    transactionId: transaction.transactionId,
    operation: GUEST_WALLET_TYPE.TRANSFER,
    timestamp: moment(timestamp).unix(),
    quantity: payload.quantity,
    symbol: payload.symbol,
    from,
    to,
  });
};

exports.parse = async (transaction, blockNumber, timestamp) => {
  const action = _.get(transaction, 'action');
  switch (action) {
    case ENGINE_CONTRACT_ACTIONS.TRANSFER:
      await parseTransfer(transaction, blockNumber, timestamp);
  }

  const notificationsData = getRequestData(transaction, blockNumber);
  if (_.isEmpty(notificationsData)) return;
  sendSocketNotification(notificationsData);
};
