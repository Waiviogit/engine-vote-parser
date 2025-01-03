const { UserExpertise } = require('database').models;

exports.find = async ({
  condition, select, sort = {}, skip = 0, limit,
}) => {
  try {
    return {
      result: await UserExpertise
        .find(condition, select)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
    };
  } catch (error) {
    return { error };
  }
};

exports.updateOne = async (condition, updateData, options) => {
  try {
    return { result: await UserExpertise.updateOne(condition, updateData, options) };
  } catch (error) {
    return { error };
  }
};
