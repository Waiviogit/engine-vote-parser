const axios = require('axios');
const _ = require('lodash');
const BigNumber = require('bignumber.js');

const volumeRequest = async (symbol = 'WAIV') => {
  try {
    const result = await axios.get(`https://info-api.tribaldex.com/market/ohlcv?symbol=${symbol}&interval=daily`);
    return _.get(result, 'data');
  } catch (error) {
    console.error(error.message);
  }
};

const getCurrencyFromCoingecko = async () => {
  try {
    const result = await axios
      .get('https://api.coingecko.com/api/v3/simple/price?ids=hive,hive_dollar&vs_currencies=usd');
    return {
      usdCurrency: _.get(result, 'data.hive.usd'),
      hbdToDollar: _.get(result, 'data.hive_dollar.usd'),
    };
  } catch (error) {
    console.error(error.message);
    return { error };
  }
};

const getTradingVolume = async (symbol = 'WAIV') => {
  const volume = await volumeRequest(symbol);
  const { usdCurrency } = await getCurrencyFromCoingecko();

  const { buy, sell } = _.reduce(volume, (acc, el) => {
    acc.buy = acc.buy.plus(el.quoteVolume);
    acc.sell = acc.sell.plus(el.baseVolume);
    return acc;
  }, { buy: BigNumber(0), sell: BigNumber(0) });

  const totalBuy = buy.toFixed();
  const totalSell = sell.toFixed();
  const allToHiveUsd = buy.plus(sell).times(usdCurrency).toFixed();

  console.info(`Volume for last ${volume.length} days \n`);
  console.info('Total bought:', totalBuy);
  console.info('Total sell', totalSell);
  console.info('Total usd volume:', allToHiveUsd);
};

(async () => {
  await getTradingVolume();
})();
