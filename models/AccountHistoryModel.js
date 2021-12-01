const _ = require('lodash');
const AccountHistoryModel = require('database').models.AccountHistory;

const create = async (data) => {
  const AccountHistory = new AccountHistoryModel(data);
  try {
    return { account_histories: await AccountHistory.save() };
  } catch (error) {
    return { error };
  }
};

module.exports = { create };
