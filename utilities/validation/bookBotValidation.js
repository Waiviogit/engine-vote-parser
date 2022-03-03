const Joi = require('joi');

exports.bookBotSchema = Joi.object({
  account: Joi.string().required(),
  key: Joi.string().required(),
  symbol: Joi.string().required(),
  tokenPair: Joi.string().required(),
  updateQuantityPercent: Joi.number().min(1).max(99).required(),
  priceDiffPercent: Joi.number().min(0.01).max(1000).required(),
  positions: Joi.object().required(),
});

exports.bookPercentSchema = Joi.object({
  percentToSellSwap: Joi.number().min(0.001).max(0.9).required(),
  percentToSellSymbol: Joi.number().min(0.001).max(0.9).required(),
  percentToBuySwap: Joi.number().min(0.001).max(0.9).required(),
  percentToBuySymbol: Joi.number().min(0.001).max(0.9).required(),
});

exports.bookPositionSchema = Joi.object({
  positionBuy: Joi.number().min(0).max(0.999).required(),
  positionSell: Joi.number().min(0).required(),
});
