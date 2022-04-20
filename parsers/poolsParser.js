const _ = require('lodash');
const {
  ENGINE_CONTRACTS,
} = require('../constants/hiveEngine');
const jsonHelper = require('../utilities/helpers/jsonHelper');
const { PYRAMIDAL_BOTS } = require('../constants/pyramidalBot');
const { startPyramidalBot } = require('../utilities/pyramidalBot/pyramidalBot');

exports.parse = async ({ transactions }) => {
  if (process.env.NODE_ENV !== 'staging') return;

  const { marketPool } = _.reduce(transactions, (acc, transaction) => {
    const marketPoolCondition = transaction.contract === ENGINE_CONTRACTS.MARKETPOOLS;
    if (marketPoolCondition) acc.marketPool.push(transaction);

    return acc;
  }, { marketPool: [] });

  const tokenPair = handleSwapEvents(marketPool);
  if (tokenPair) await startPyramidalBot(tokenPair);
};

const handleSwapEvents = (marketPool) => {
  for (const marketPoolElement of marketPool) {
    const payload = jsonHelper.parseJson(_.get(marketPoolElement, 'payload'));
    const logs = jsonHelper.parseJson(_.get(marketPoolElement, 'logs'));
    if (_.isEmpty(logs) || _.has(logs, 'errors')) continue;

    const imbalancedPool = _.find(_.flatten((_.map(PYRAMIDAL_BOTS, 'tokenPairs'))),
      (pair) => _.includes(pair, _.get(payload, 'tokenPair')));
    if (imbalancedPool) return imbalancedPool;
  }
};
