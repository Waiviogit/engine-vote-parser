const _ = require('lodash');
const {
  ENGINE_CONTRACTS, MARKET_CONTRACT, MARKET_CONTRACT_BOOKBOT_EVENT, TOKENS_CONTRACT,
} = require('constants/hiveEngine');
const jsonHelper = require('utilities/helpers/jsonHelper');
const { BOOK_BOTS } = require('constants/bookBot');
const bookBot = require('utilities/bookBot/bookBot');
const blockchain = require('utilities/hiveEngine/blockchain');

exports.parse = async ({ transactions }) => {
  if (process.env.NODE_ENV !== 'production') return;
  const { market, marketPool, marketCancel } = _.reduce(transactions, (acc, transaction) => {
    const cancelCondition = transaction.contract === ENGINE_CONTRACTS.MARKET
      && transaction.action === MARKET_CONTRACT.CANCEL;
    const marketCondition = transaction.contract === ENGINE_CONTRACTS.MARKET
    && _.includes(MARKET_CONTRACT_BOOKBOT_EVENT, transaction.action);
    const marketPoolCondition = transaction.contract === ENGINE_CONTRACTS.MARKETPOOLS;

    if (marketCondition) acc.market.push(transaction);
    if (marketPoolCondition) acc.marketPool.push(transaction);
    if (cancelCondition) acc.marketCancel.push(transaction);
    return acc;
  }, { market: [], marketPool: [], marketCancel: [] });

  const usualEvent = [];
  const tradeEvent = [];
  handleMarketEvents({ market, usualEvent, tradeEvent });
  handleSwapEvents({ marketPool, usualEvent });
  await handleCancelEvent({ marketCancel, usualEvent });
  for (const usualSignal of _.uniqBy(usualEvent, 'symbol')) {
    await bookBot.sendBookEvent(usualSignal);
  }
  for (const eventSignal of tradeEvent) {
    await bookBot.sendBookEvent(eventSignal);
  }
};

const handleMarketEvents = ({ market, usualEvent, tradeEvent }) => {
  for (const marketElement of market) {
    const payload = jsonHelper.parseJson(_.get(marketElement, 'payload'));
    const logs = jsonHelper.parseJson(_.get(marketElement, 'logs'));
    if (_.isEmpty(logs) || _.has(logs, 'errors')) continue;
    if (!_.includes(_.map(BOOK_BOTS, 'symbol'), payload.symbol)) continue;
    const botEvents = formatBookEvents(logs);
    if (_.isEmpty(botEvents) && !hasMarketEvents(logs)) continue;
    if (_.isEmpty(botEvents) && hasMarketEvents(logs)) usualEvent.push({ symbol: payload.symbol });
    for (const event of botEvents) {
      tradeEvent.push({ symbol: payload.symbol, event });
    }
  }
};

const handleSwapEvents = ({ marketPool, usualEvent }) => {
  for (const marketPoolElement of marketPool) {
    const payload = jsonHelper.parseJson(_.get(marketPoolElement, 'payload'));
    const logs = jsonHelper.parseJson(_.get(marketPoolElement, 'logs'));
    if (_.isEmpty(logs) || _.has(logs, 'errors')) continue;
    const hasBookPools = _.includes(_.map(BOOK_BOTS, 'tokenPair'), _.get(payload, 'tokenPair'));
    if (!hasBookPools) continue;
    const symbols = _.find(logs.events, (e) => e.event === 'swapTokens');

    const symbolOut = _.get(symbols, 'data.symbolOut');
    const symbolIn = _.get(symbols, 'data.symbolIn');
    const bookSymbol = symbolOut === 'SWAP.HIVE' ? symbolIn : symbolOut;
    usualEvent.push({ symbol: bookSymbol });
  }
};

const handleCancelEvent = async ({ marketCancel, usualEvent }) => {
  await Promise.all(_.map(marketCancel, async (cancel) => {
    const payload = jsonHelper.parseJson(_.get(cancel, 'payload'));
    if (!payload.id) return;
    const result = await blockchain.getTransactionInfo({ params: { txid: payload.id } });
    const cancelPayload = jsonHelper.parseJson(_.get(result, 'payload'));
    if (_.isEmpty(cancelPayload)) return;
    if (!_.includes(_.map(BOOK_BOTS, 'symbol'), cancelPayload.symbol)) return;
    usualEvent.push({ symbol: cancelPayload.symbol });
  }));
};

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
