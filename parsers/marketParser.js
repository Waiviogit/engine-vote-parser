const { TOKEN_WAIV } = require('constants/hiveEngine');
const jsonHelper = require('utilities/helpers/jsonHelper');
const { addToGreyList } = require('../utilities/helpers/greyListHelper');

const parse = async (transaction, blockNumber, timestamp) => {
  if (process.env.NODE_ENV !== 'production') return;
  if (!['sell', 'marketSell'].includes(transaction.action)) return;

  const payload = jsonHelper.parseJson(transaction.payload, null);
  if (payload?.symbol === TOKEN_WAIV.SYMBOL) await addToGreyList(transaction.sender);
};

module.exports = {
  parse,
};
