const { App } = require('database').models;

exports.findOne = async (condition) => {
  try {
    return { result: await App.findOne(condition, '+service_bots').lean() };
  } catch (error) {
    return { error };
  }
};
