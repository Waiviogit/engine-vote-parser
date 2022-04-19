const Joi = require('joi');

exports.pyramidalBotSchema = Joi.object({
  account: Joi.string().required(),
  key: Joi.string().required(),
  tokenPairs: Joi.array().items(Joi.string()).max(3).required(),
  stableTokens: Joi.array().items(Joi.string()).min(1).required(),
  stablePair: Joi.string().required(),
  tokenSymbol: Joi.string().required(),
  startAmountIn: Joi.number().max(500).required(),
});
