const { pyramidalBotSchema } = require('../../validation/pyramidalBotValidation');

exports.validatePyramidalBot = (bot) => {
  const { error } = pyramidalBotSchema.validate(bot);
  if (error) return false;

  return true;
};
