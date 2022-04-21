const Joi = require('joi');

exports.pyramidalBotSchema = Joi.object({
  account: Joi.string().required(),
  key: Joi.string().required(),
  tokenPairs: Joi.array().items(Joi.string()).max(3).required(),
  stableTokens: Joi.array().items(Joi.string()).min(1).required(),
  stablePair: Joi.string().required(),
  tokenSymbol: Joi.string().required(),
  lowestAmountOutBound: Joi.number().min(0.01).required(),
  startIncomeDifference: Joi.number().equal(0).required(),
  tokenPrecision: Joi.number().min(1).required(),
  approachCoefficient: Joi.number().equal(0.99).required(),
});
