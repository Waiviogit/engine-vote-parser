const {
  TRANSFER_ID, FEE, PARSE_MATCHING, REFUND_STATUSES, STATUSES, REFUND_ID, PAYMENT_TYPES,
} = require('constants/sitesData');
const { websitePayments, websiteRefunds, App } = require('models');
const { getPriceWaivUsd } = require('utilities/helpers/tokenPriceHelper');
const _ = require('lodash');
const BigNumber = require('bignumber.js');

module.exports = async ({
  blockNumber, type, transaction, payload,
}) => {
  if ((type === TRANSFER_ID && payload.to !== FEE.account)
        || payload.symbol !== FEE.currency) return false;

  const { price: priceWaivUsd, error } = await getPriceWaivUsd();
  if (error) {
    console.error(error.message);
    return;
  }
  const amount = BigNumber(priceWaivUsd).times(payload.quantity).dp(3).toNumber();

  const payment = {
    type: PARSE_MATCHING[type],
    amount,
    userName: type === TRANSFER_ID ? transaction.sender : payload.to,
    transferTo: payload.to,
    blockNum: blockNumber,
  };
  await websitePayments.create(payment);
  switch (type) {
    case REFUND_ID:
      await websiteRefunds.updateOne(
        { userName: payload.to, status: REFUND_STATUSES.PENDING },
        { status: REFUND_STATUSES.COMPLETED },
      );
      break;
    case TRANSFER_ID:
      const { result = [] } = await App.find({ owner: transaction.sender, inherited: true });

      const { payable: balance } = await getAccountBalance(transaction.sender);
      if (balance < 0 || _.get(result, '[0].status', '') !== STATUSES.SUSPENDED) return;

      for (const app of result) {
        let status = STATUSES.PENDING;
        app.activatedAt ? status = STATUSES.ACTIVE : null;
        app.deactivatedAt ? status = STATUSES.INACTIVE : null;
        await App.updateOne({ _id: app._id }, { status });
      }
  }
};

const getAccountBalance = async (account) => {
  const { error, result: payments } = await websitePayments.find({
    condition: { userName: account },
    sort: { createdAt: 1 },
  });
  if (error) return { error };
  let payable = 0;
  _.map(payments, (payment) => {
    switch (payment.type) {
      case PAYMENT_TYPES.TRANSFER:
        payment.balance = payable + payment.amount;
        payable = payment.balance;
        break;
      case PAYMENT_TYPES.WRITE_OFF:
      case PAYMENT_TYPES.REFUND:
        payment.balance = payable - payment.amount;
        payable = payment.balance;
        break;
    }
  });
  return { payable };
};
