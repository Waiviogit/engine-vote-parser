const { App } = require('database').models;

exports.findOne = async (condition) => {
  try {
    return { result: await App.findOne(condition, '+service_bots').lean() };
  } catch (error) {
    return { error };
  }
};

exports.updateOne = async (condition, updateData) => {
  try {
    return { result: await App.updateOne(condition, updateData) };
  } catch (error) {
    return { error };
  }
};

exports.find = async (condition, select) => {
  try {
    return { result: await App.find(condition, select).lean() };
  } catch (error) {
    return { error };
  }
};
