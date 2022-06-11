const { CurrenciesStatistics } = require('../currenciesDB').models;

exports.findOne = async (condition) => {
  try {
    return {
      result: await CurrenciesStatistics.findOne(condition).lean(),
    };
  } catch (error) {
    return { error };
  }
};
