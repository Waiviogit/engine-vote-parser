const Joi = require('joi');

exports.bookBotSchema = Joi.object({
  account: Joi.string().required(),
  key: Joi.string().required(),
  symbol: Joi.string().required(),
  tokenPair: Joi.string().required(),
  updateQuantityPercent: Joi.number().min(1).max(99).required(),
  priceDiffPercent: Joi.number().min(0.01).max(1000).required(),
  buyDiffPercent: Joi.number().min(0.001).max(1000).required(),
  sellDiffPercent: Joi.number().min(0.001).max(1000).required(),
  buyRatio: Joi.number().min(2).max(1000).required(),
  sellRatio: Joi.number().min(2).max(1000).required(),
  startBuyQuantity: Joi.number().min(10).required(),
  startSellQuantity: Joi.number().min(10).required(),
  swapBalanceUsage: Joi.number().min(0.001).max(1).required(),
  symbolBalanceUsage: Joi.number().min(0.001).max(1).required(),
  untouchedSwapPercent: Joi.number().min(0.001).max(0.999).required(),
  untouchedSymbolPercent: Joi.number().min(0.001).max(0.999).required(),
  profitPercent: Joi.number().min(0.0001).required(),
});
