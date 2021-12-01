const mongoose = require('mongoose');

const { Schema } = mongoose;

const EngineAccountHistorySchema = new Schema({
  refHiveBlockNumber: { type: Number },
  blockNumber: { type: Number },
  account: { type: String },
  transactionId: { type: String, unique: true },
  operation: { type: String },
  symbolOut: { type: String },
  symbolOutQuantity: { type: String },
  symbolIn: { type: String },
  symbolInQuantity: { type: String },
  timestamp: { type: Number },
  quantity: { type: String },
  symbol: { type: String },
  tokenState: { type: String },
});
const EngineAccountHistoryModel = mongoose.model('engine_account_histories', EngineAccountHistorySchema);

module.exports = EngineAccountHistoryModel;
