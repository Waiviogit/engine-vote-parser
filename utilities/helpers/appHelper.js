const App = require('models/AppModel');
const config = require('config');

exports.getBlackListUsers = async () => {
  const { result: app } = await App.findOne({ host: config.appHost });
  if (!app) return { error: { message: 'App not found!' } };
  return { users: app.black_list_users, referralsData: app.referralsData };
};
