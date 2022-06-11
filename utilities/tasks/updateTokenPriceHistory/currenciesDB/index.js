const mongoose = require('mongoose');
const config = require('config');

const URI = `mongodb://${config.currenciesDB.host}:${config.currenciesDB.port}/${config.currenciesDB.database}`;

mongoose.connect(URI, {
  useNewUrlParser: true, useFindAndModify: false, useCreateIndex: true, useUnifiedTopology: true,
})
  .then(() => console.log('CurrenciesDB connection successful!'))
  .catch((error) => console.error(error));

mongoose.connection.on('error', console.error.bind(console, 'CurrenciesDB connection error:'));

mongoose.Promise = global.Promise;

module.exports = {
  Mongoose: mongoose,
  models: {
    HiveEngineRate: require('./schemas/HiveEngineRateSchema'),
    CurrenciesStatistics: require('./schemas/CurrenciesStatisticSchema'),
  },
};
