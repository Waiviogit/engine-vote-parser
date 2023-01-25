const {
  PRICE_FOR_TICKET_HIVE, POSSIBLE_DISCREPANCY, TICKETS_ACCOUNT, Q_NAME,
} = require('constants/vipTicketsData');
const { GUEST_TRANSFER_TYPE } = require('constants/common');
const { TOKEN_WAIV } = require('constants/hiveEngine');
const { getWaivPool } = require('utilities/helpers/tokenPriceHelper');
const BigNumber = require('bignumber.js');
const redisQueue = require('utilities/redis/rsmq/redisQueue');
const _ = require('lodash');

module.exports = async ({
  blockNumber, transaction, payload, memoJson,
}) => {
  const valid = validateTransfer({ payload });
  if (!valid) return;
  let from = transaction.sender;

  if (_.get(memoJson, 'id') === GUEST_TRANSFER_TYPE.FROM_GUEST) {
    from = _.get(memoJson, 'from');
    if (!from) return;
  }

  const ticketsAmount = await getTicketsAmount(payload.quantity);
  if (!ticketsAmount) return;

  const message = JSON.stringify({
    ticketsAmount,
    blockNum: blockNumber,
    amount: payload.quantity,
    from,
    to: payload.to,
  });

  return redisQueue.sendMessageToQueue({ message, qname: Q_NAME });
};

const validateTransfer = ({ payload }) => {
  if (!_.includes(['test', 'production'], process.env.NODE_ENV)) return;
  if (payload.symbol !== TOKEN_WAIV.SYMBOL) return;
  if (payload.to !== TICKETS_ACCOUNT) return;
  if (!parseFloat(payload.quantity)) return;
  return true;
};

const getTicketsAmount = async (waivQuantity) => {
  const pool = await getWaivPool();
  const amount = BigNumber(waivQuantity).times(pool.quotePrice).dp(3).toNumber();

  if (amount % PRICE_FOR_TICKET_HIVE === 0) return amount / PRICE_FOR_TICKET_HIVE;

  return amount % PRICE_FOR_TICKET_HIVE >= PRICE_FOR_TICKET_HIVE - POSSIBLE_DISCREPANCY
    ? Math.ceil(amount / PRICE_FOR_TICKET_HIVE)
    : Math.floor(amount / PRICE_FOR_TICKET_HIVE);
};
