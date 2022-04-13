const _ = require('lodash');
const {
  ENGINE_CONTRACTS,
  MARKET_CONTRACT_BOOKBOT_EVENT,
} = require('../constants/hiveEngine');
const jsonHelper = require('../utilities/helpers/jsonHelper');
const { BOOK_BOTS } = require('../constants/bookBot');
const { PYRAMIDAL_BOTS } = require('../constants/pyramidalBot');

exports.parse = async ({ transactions }) => {
  console.log('inside poolsParser!!!');
//  if (process.env.NODE_ENV !== 'staging') return;

  // возможно, маркет не нужен
  const { market, marketPool } = _.reduce(transactions, (acc, transaction) => {
    const marketCondition = transaction.contract === ENGINE_CONTRACTS.MARKET
      && _.includes(MARKET_CONTRACT_BOOKBOT_EVENT, transaction.action);
    const marketPoolCondition = transaction.contract === ENGINE_CONTRACTS.MARKETPOOLS;

    if (marketCondition) acc.market.push(transaction);
    if (marketPoolCondition) acc.marketPool.push(transaction);
    return acc;
  }, { market: [], marketPool: [] });

 // console.log('market', market);
  console.log('marketPool', marketPool);

  const usualEvent = [];
  handleSwapEvents({ marketPool, usualEvent });
};

const handleSwapEvents = ({ marketPool, usualEvent }) => {
  for (const marketPoolElement of marketPool) {
    const payload = jsonHelper.parseJson(_.get(marketPoolElement, 'payload'));
    const logs = jsonHelper.parseJson(_.get(marketPoolElement, 'logs'));
    if (_.isEmpty(logs) || _.has(logs, 'errors')) continue;
    const hasBookPools = _.find(_.map(PYRAMIDAL_BOTS, 'tokenPairs'), _.get(payload, 'tokenPair'));
    console.log('hasBookPools', hasBookPools);
    if (!hasBookPools) continue;
    // const symbols = _.find(logs.events, (e) => e.event === 'swapTokens');
    //
    // const symbolOut = _.get(symbols, 'data.symbolOut');
    // const symbolIn = _.get(symbols, 'data.symbolIn');
    // const bookSymbol = symbolOut === 'SWAP.HIVE' ? symbolIn : symbolOut;
    // usualEvent.push({ symbol: bookSymbol });
  }
};
