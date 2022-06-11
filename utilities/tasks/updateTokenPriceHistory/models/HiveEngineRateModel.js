const { HiveEngineRate } = require('../currenciesDB').models;

exports.findOne = async (condition) => {
  try {
    return {
      result: await HiveEngineRate.findOne(condition).lean(),
    };
  } catch (error) {
    return { error };
  }
};

exports.create = async (data) => {
  try {
    const newRates = new HiveEngineRate(data);
    return { result: await newRates.save() };
  } catch (error) {
    return { error };
  }
};
