const _ = require('lodash');
const {
  ENGINE_CONTRACTS, MARKET_CONTRACT_BOOKBOT_EVENT, TOKENS_CONTRACT,
} = require('constants/hiveEngine');
const jsonHelper = require('utilities/helpers/jsonHelper');
const { BOOK_BOTS } = require('constants/bookBot');
const bookBot = require('utilities/bookBot/bookBot');
const { tokensContract } = require('../utilities/hiveEngine');
const { getTokenPrecisionQuantity } = require('../utilities/bookBot/helpers/getTokenPrecisionQuantityHelper');

exports.parse = async ({ transactions }) => {
  if (process.env.NODE_ENV !== 'staging') return;
  const { market, marketPool } = _.reduce(transactions, (acc, transaction) => {
    const marketCondition = transaction.contract === ENGINE_CONTRACTS.MARKET
    && _.includes(MARKET_CONTRACT_BOOKBOT_EVENT, transaction.action);
    const marketPoolCondition = transaction.contract === ENGINE_CONTRACTS.MARKETPOOLS;

    if (marketCondition) acc.market.push(transaction);
    if (marketPoolCondition) acc.marketPool.push(transaction);
    return acc;
  }, { market: [], marketPool: [] });

  const usualEvent = [];
  const tradeEvent = [];
  await handleMarketEvents({ market, usualEvent, tradeEvent });
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

const handleMarketEvents = async ({ market, usualEvent, tradeEvent }) => {
  for (const marketElement of market) {
    const payload = jsonHelper.parseJson(_.get(marketElement, 'payload'));
    const logs = jsonHelper.parseJson(_.get(marketElement, 'logs'));
    if (_.isEmpty(logs) || _.has(logs, 'errors')) continue;
    if (!_.includes(_.map(BOOK_BOTS, 'symbol'), payload.symbol)) continue;
    const botEvents = await formatBookEvents(logs);
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

const formatBookEvents = async (logs) => {
  const bookBots = _.map(BOOK_BOTS, 'account');
  const events = await getEvents(logs);

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

const getEvents = async (logs) => {
  const events = _.filter(_.get(logs, 'events', []), (el) => el.event === TOKENS_CONTRACT.TRANSFER_FROM_CONTRACT);
  if (events.length % 2 === 0) return events;

  const deepClonedEvents = _.cloneDeep(events);
  const sortedEvents = deepClonedEvents.sort((a, b) => ((a.data.to > b.data.to) ? 1
    : ((b.data.to > a.data.to) ? -1 : 0)));

  const duplicatedTransactions = [];

  for (let count = 0; count < sortedEvents.length - 1; count++) {
    const isDuplicated = sortedEvents[count].data.to.includes(sortedEvents[count + 1].data.to)
      && sortedEvents[count].data.from.includes(sortedEvents[count + 1].data.from);

    if (isDuplicated) duplicatedTransactions.push(sortedEvents[count], sortedEvents[count + 1]);
  }
  /** Clear events from possible accident system transaction */
  if (duplicatedTransactions.length) await removeSystemTransaction(duplicatedTransactions, events);

  return events;
};

const removeSystemTransaction = async (duplicatedTransactions, events) => {
  const tokenSymbols = _.uniq(_.map(duplicatedTransactions,
    (transaction) => transaction.data.symbol));

  for (const symbol of tokenSymbols) {
    const token = await tokensContract.getTokensParams({ query: { symbol } });

    const systemTransaction = duplicatedTransactions
      .find((transaction) => transaction.data.symbol === symbol
        && transaction.data.quantity <= getTokenPrecisionQuantity(_.get(token, '[0].precision', 8)));

    if (systemTransaction) {
      const indexOfTransaction = events.findIndex((transaction) => _.isEqual(
        systemTransaction,
        transaction,
      ));

      events.splice(indexOfTransaction, 1);
    }
  }
};
