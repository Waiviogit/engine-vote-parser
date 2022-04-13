const _ = require('lodash');
const {
  ENGINE_CONTRACTS,
} = require('../constants/hiveEngine');
const jsonHelper = require('../utilities/helpers/jsonHelper');
const { PYRAMIDAL_BOTS } = require('../constants/pyramidalBot');

exports.parse = async ({ transactions }) => {
  console.log('inside poolsParser!!!');
//  if (process.env.NODE_ENV !== 'staging') return;

  // возможно, маркет не нужен
  const { marketPool } = _.reduce(transactions, (acc, transaction) => {
    const marketPoolCondition = transaction.contract === ENGINE_CONTRACTS.MARKETPOOLS;
    if (marketPoolCondition) acc.marketPool.push(transaction);

    return acc;
  }, { marketPool: [] });

  console.log('marketPool', marketPool);

  const events = [];
  handleSwapEvents({ marketPool, events });
};

const handleSwapEvents = ({ marketPool, events }) => {
  for (const marketPoolElement of marketPool) {
    const payload = jsonHelper.parseJson(_.get(marketPoolElement, 'payload'));
    const logs = jsonHelper.parseJson(_.get(marketPoolElement, 'logs'));
    if (_.isEmpty(logs) || _.has(logs, 'errors')) continue;

    const imbalancedPool = _.find(_.flatten((_.map(PYRAMIDAL_BOTS, 'tokenPairs'))),
      (pair) => _.includes(pair, _.get(payload, 'tokenPair')));
    console.log('imbalancedPool', imbalancedPool);
    if (!imbalancedPool) continue;


     // то это тригер для бота! нужно ли здесь смотреть аут и ин? или достаточно тут же дергать бота?
    // номер блока для такого тригера с одним из пулов 16484360 (как пример)
    const symbols = _.find(logs.events, (e) => e.event === 'swapTokens');

    const symbolOut = _.get(symbols, 'data.symbolOut');
    console.log('symbolOut', symbolOut);
    const symbolIn = _.get(symbols, 'data.symbolIn');
    console.log('symbolIn', symbolIn);
    // если аут здесь не БИ, то пойти и посмотреть не купить ли в этом пуле БИ (чтоб продать в другом)
    const bookSymbol = !_.includes(_.map(PYRAMIDAL_BOTS, 'imbalancedToken'), symbolOut) ? symbolIn : symbolOut;
    events.push({ symbol: bookSymbol });
  }
};
