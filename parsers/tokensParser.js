const _ = require('lodash');
const { parseJson } = require('utilities/helpers/jsonHelper');
const processSitePayment = require('utilities/sites/processSitePayment');
const ticketsProcessor = require('utilities/vipTickets/ticketsProcessor');
const { ENGINE_CONTRACT_ACTIONS, TOKEN_WAIV } = require('constants/hiveEngine');
const {
  GUEST_TRANSFER_TYPE, GUEST_WALLET_TYPE,
} = require('constants/common');
const {
  TRANSFER_ID, REFUND_ID, TRANSFER_GUEST_ID,
} = require('constants/sitesData');
const {
  GuestWallet,
} = require('models');
const moment = require('moment');
const { sendSocketNotification } = require('../utilities/notificationsApi/notificationsUtil');
const jsonHelper = require('../utilities/helpers/jsonHelper');
const { addToGreyList } = require('../utilities/helpers/greyListHelper');

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
          from: _.get(transaction, 'sender'),
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
  return data;
};

const greyListCheck = async ({ symbol, to, sender }) => {
  if (symbol !== TOKEN_WAIV.SYMBOL) return;
  if (process.env.NODE_ENV !== 'production') return;
  await addToGreyList(sender);
};

const parseTransfer = async (transaction, blockNumber, timestamp) => {
  const payload = parseJson(_.get(transaction, 'payload'));
  const logs = parseJson(_.get(transaction, 'logs'));
  if (_.isEmpty(payload) || logs.errors) return;

  await greyListCheck({
    symbol: payload.symbol,
    to: payload.to,
    sender: transaction.sender,
  });

  const memoJson = parseJson(payload.memo);
  if (transaction.sender === process.env.GUEST_HOT_ACC && payload.symbol !== TOKEN_WAIV.SYMBOL) {
    await parseGuestWithdraw({ payload, transaction, blockNumber });
  }
  await ticketsProcessor({
    blockNumber, transaction, payload, memoJson,
  });
  if (!_.has(memoJson, 'id')) return;

  switch (memoJson.id) {
    case GUEST_TRANSFER_TYPE.TO_GUEST:
    case GUEST_TRANSFER_TYPE.FROM_GUEST:
    case GUEST_TRANSFER_TYPE.GUEST_CAMPAIGN_REWARD:
      await parseGuestTransfer({
        transaction, payload, memo: memoJson, blockNumber, timestamp,
      });
      break;
    case TRANSFER_ID:
    case REFUND_ID:
      await processSitePayment({
        blockNumber, payload, transaction, type: memoJson.id,
      });
      break;
    case TRANSFER_GUEST_ID:
      await parseGuestTransfer({
        transaction,
        payload,
        memo: {
          ...memoJson,
          id: GUEST_TRANSFER_TYPE.FROM_GUEST,
        },
        blockNumber,
        timestamp,
      });
      await processSitePayment({
        blockNumber,
        payload,
        transaction: {
          ...transaction,
          sender: memoJson.from,
        },
        type: TRANSFER_ID,
      });
  }
};

const parseGuestWithdraw = async ({ payload, transaction, blockNumber }) => {
  const {
    inputSymbol,
    inputQuantity,
    address,
    account,
    symbol,
  } = payload;
  if (!address || !inputSymbol || !inputQuantity || !account) return;

  const symbolOut = symbol.replace('SWAP.', '');

  await GuestWallet.create({
    refHiveBlockNumber: transaction.refHiveBlockNumber,
    blockNumber,
    account,
    transactionId: transaction.transactionId,
    operation: GUEST_WALLET_TYPE.WITHDRAW,
    timestamp: moment().unix(),
    quantity: inputQuantity,
    symbol: inputSymbol,
    symbolOut,
    to: address,
    from: account,
  });
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

  const account = memo.id === GUEST_TRANSFER_TYPE.FROM_GUEST ? from : to;

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
      break;
    case ENGINE_CONTRACT_ACTIONS.UNSTAKE:
      const payload = jsonHelper.parseJson(transaction.payload, null);
      if (payload?.symbol === TOKEN_WAIV.SYMBOL) await addToGreyList(transaction.sender);
      break;
  }

  const notificationsData = getRequestData(transaction, blockNumber);
  if (_.isEmpty(notificationsData)) return;
  sendSocketNotification(notificationsData);
};
