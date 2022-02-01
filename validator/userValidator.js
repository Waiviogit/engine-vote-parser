const _ = require('lodash');

exports.validateUserOnBlacklist = (names = [], blacklist) => {
  const formattedNames = _.flatMap([names], (n) => n);
  return _.some(formattedNames, (name) => blacklist.includes(name));
};
