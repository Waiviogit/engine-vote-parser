const jsonHelper = require('utilities/helpers/jsonHelper');
const { MARKET_CONTRACT, TOKENS_CONTRACT, MARKET_CONTRACT_BOOKBOT_EVENT } = require('constants/hiveEngine');
const { BOOK_BOTS } = require('constants/bookBot');
const bookBot = require('utilities/bookBot/bookBot');

const _ = require('lodash');

const formatBookEvents = (logs) => {
  const bookBots = _.map(BOOK_BOTS, 'account');
  return _.reduce(_.get(logs, 'events', []), (acc, el, index) => {
    if (el.event === TOKENS_CONTRACT.TRANSFER_FROM_CONTRACT) {
      const txIndex = index % 2 !== 0
        ? index + 1
        : index - 1;
      const tx = {};
      tx.action = index % 2 !== 0
        ? 'buy'
        : 'sell';
      tx.quantityTokens = tx.action === 'buy'
        ? el.data.quantity
        : _.get(logs, `events[${txIndex}].data.quantity`);
      tx.quantityHive = tx.action === 'buy'
        ? _.get(logs, `events[${txIndex}].data.quantity`)
        : el.data.quantity;
      tx.buyer = tx.action === 'buy'
        ? el.data.to
        : _.get(logs, `events[${txIndex}].data.to`);

      tx.seller = tx.action === 'buy'
        ? _.get(logs, `events[${txIndex}].data.to`)
        : el.data.to;
      if (tx.action === 'buy' && _.includes(bookBots, tx.buyer)) acc.push(tx);
      if (tx.action === 'sell' && _.includes(bookBots, tx.seller)) acc.push(tx);
    }
    return acc;
  }, []);
};

const hasMarketEvents = (logs) => _.some(
  _.map(_.get(logs, 'events', []), 'event'),
  (el) => _.includes(
    [TOKENS_CONTRACT.TRANSFER_FROM_CONTRACT, TOKENS_CONTRACT.TRANSFER_TO_CONTRACT],
    el,
  ),
);

const sendBookSignal = async ({ transaction, payload, logs }) => {
  if (_.includes(MARKET_CONTRACT_BOOKBOT_EVENT, transaction.action)) {
    const botEvents = formatBookEvents(logs);
    if (_.isEmpty(botEvents) && !hasMarketEvents(logs)) return;
    if (_.isEmpty(botEvents) && hasMarketEvents(logs)) {
      return bookBot.sendBookEvent({ symbol: payload.symbol });
    }
    for (const event of botEvents) {
      await bookBot.sendBookEvent({ symbol: payload.symbol, event });
    }
  }
  // if (transaction.action === MARKET_CONTRACT.CANCEL) {
  // we cant get symbol cancel
  //   return bookBot.sendBookEvent({ symbol: payload.symbol });
  // }
};

exports.parse = async (transaction, blockNumber) => {
  const payload = jsonHelper.parseJson(_.get(transaction, 'payload'));
  const logs = jsonHelper.parseJson(_.get(transaction, 'logs'));
  if (_.isEmpty(logs) || _.has(logs, 'errors')) return;
  await sendBookSignal({ transaction, payload, logs });
};
