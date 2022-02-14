const jsonHelper = require('utilities/helpers/jsonHelper');
const { MARKET_CONTRACT, TOKENS_CONTRACT } = require('constants/hiveEngine');
const bookBot = require('utilities/bookBot/bookBot');

const _ = require('lodash');

const formatBookEvents = async ({ logs, symbol }) => {
  const kek = 1;
  console.log();
};

const sendBookSignal = async ({ transaction, payload, logs }) => {
  if (_.includes([MARKET_CONTRACT.MARKET_SELL, MARKET_CONTRACT.SELL, MARKET_CONTRACT.BUY, MARKET_CONTRACT.MARKET_BUY], transaction.action)) {
    return formatBookEvents({ logs, symbol: payload.symbol });
  }
  console.log(transaction.action);
};

exports.parse = async (transaction, blockNumber) => {
  const payload = jsonHelper.parseJson(_.get(transaction, 'payload'));
  const logs = jsonHelper.parseJson(_.get(transaction, 'logs'));
  if (_.isEmpty(logs) || _.has(logs, 'errors')) return;
  await sendBookSignal({ transaction, payload, logs });
};
