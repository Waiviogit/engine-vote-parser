const {
  ENGINE_CONTRACTS,
  TOKENS_CONTRACT,
} = require('../../../constants/hiveEngine');

const getObjectForTransfer = (symbol, quantity) => ({
  contractName: ENGINE_CONTRACTS.TOKENS,
  contractAction: TOKENS_CONTRACT.TRANSFER,
  contractPayload:
    {
      symbol,
      to: process.env.BANK_BOT_ACCOUNT,
      quantity,
    },
});

exports.getJsonsToBroadcast = ({ object, symbol, quantity }) => [
  object.buyOutputJson,
  object.sellOutputJson,
  object.equalizeOutputJson,
  getObjectForTransfer(symbol, quantity),
];
