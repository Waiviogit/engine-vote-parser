const _ = require('lodash');
const {
  ENGINE_CONTRACTS, MARKET_CONTRACT, MARKET_CONTRACT_BOOKBOT_EVENT, TOKENS_CONTRACT,
} = require('constants/hiveEngine');
const jsonHelper = require('utilities/helpers/jsonHelper');
const { BOOK_BOTS } = require('constants/bookBot');
const bookBot = require('utilities/bookBot/bookBot');

exports.parse = async ({ transactions }) => {
  if (process.env.NODE_ENV !== 'staging') return;
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

  for (const usualSignal of _.uniqBy(usualEvent, 'symbol')) {
    const sendSignal = !_.some(tradeEvent, (event) => event.symbol === usualSignal.symbol);
    if (sendSignal) await bookBot.sendBookEvent(usualSignal);
  }
  if (_.isEmpty(tradeEvent)) return;

  const sortedTrades = sortTradeBySymbol(tradeEvent);
  for (const symbolDeal in sortedTrades) {
    await bookBot.sendBookEvent({ symbol: symbolDeal, events: sortedTrades[symbolDeal] });
  }
};

const sortTradeBySymbol = (events) => _.reduce(events, (accum, el) => {
  if (!_.has(accum, `${el.symbol}`)) accum[el.symbol] = [];
  accum[el.symbol].push(el.event);
  return accum;
}, {});

const handleMarketEvents = ({ market, usualEvent, tradeEvent }) => {
  for (const marketElement of market) {
    const payload = jsonHelper.parseJson(_.get(marketElement, 'payload'));
    const logs = jsonHelper.parseJson(_.get(marketElement, 'logs'));
    if (_.isEmpty(logs) || _.has(logs, 'errors')) continue;
    if (!_.includes(_.map(BOOK_BOTS, 'symbol'), payload.symbol)) continue;
    const botEvents = formatBookEvents(logs);
    if (_.isEmpty(botEvents) && !hasMarketEvents(logs)) continue;
    if (_.isEmpty(botEvents) && hasMarketEvents(logs)) {
      usualEvent.push({ symbol: payload.symbol });
      continue;
    }
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

const formatBookEvents = (logs) => {
  const bookBots = _.map(BOOK_BOTS, 'account');
  const events = _.filter(_.get(logs, 'events', []), (el) => el.event === TOKENS_CONTRACT.TRANSFER_FROM_CONTRACT);
  return _.reduce(events, (acc, el, index) => {
    const txIndex = index % 2 === 0
      ? index + 1
      : index - 1;
    const tx = {};
    tx.action = index % 2 === 0
      ? 'buy'
      : 'sell';
    tx.quantityTokens = tx.action === 'buy'
      ? el.data.quantity
      : _.get(events, `[${txIndex}].data.quantity`);
    tx.quantityHive = tx.action === 'buy'
      ? _.get(events, `[${txIndex}].data.quantity`)
      : el.data.quantity;
    tx.buyer = tx.action === 'buy'
      ? el.data.to
      : _.get(events, `[${txIndex}].data.to`);

    tx.seller = tx.action === 'buy'
      ? _.get(events, `[${txIndex}].data.to`)
      : el.data.to;
    if (tx.action === 'buy' && _.includes(bookBots, tx.buyer)) {
      acc.push(tx);
    }
    if (tx.action === 'sell' && _.includes(bookBots, tx.seller)) {
      acc.push(tx);
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
