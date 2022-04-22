const BEE_HBD_HIVE = {
  account: process.env.TRI_BOT_ACCOUNT,
  key: process.env.TRI_BOT_KEY,
  tokenPairs: ['SWAP.HIVE:BEE', 'BEE:SWAP.HBD', 'SWAP.HIVE:SWAP.HBD'],
  stableTokens: ['SWAP.HIVE', 'SWAP.HBD'],
  stablePair: 'SWAP.HIVE:SWAP.HBD',
  tokenSymbol: 'BEE',
  lowestAmountOutBound: 0.1,
  startIncomeDifference: 0,
  tokenPrecision: 8,
  approachCoefficient: 0.99,
  ourPool: false,
};

const CENT_HBD_HIVE = {
  account: process.env.TRI_BOT_ACCOUNT,
  key: process.env.TRI_BOT_KEY,
  tokenPairs: ['SWAP.HIVE:CENT', 'SWAP.HBD:CENT', 'SWAP.HIVE:SWAP.HBD'],
  stableTokens: ['SWAP.HIVE', 'SWAP.HBD'],
  stablePair: 'SWAP.HIVE:SWAP.HBD',
  tokenSymbol: 'CENT',
  lowestAmountOutBound: 0.1,
  startIncomeDifference: 0,
  tokenPrecision: 8,
  approachCoefficient: 0.99,
  ourPool: false,
};

const BUSD_HBD_HIVE = {
  account: process.env.TRI_BOT_ACCOUNT,
  key: process.env.TRI_BOT_KEY,
  tokenPairs: ['SWAP.HIVE:SWAP.BUSD', 'SWAP.HBD:SWAP.BUSD', 'SWAP.HIVE:SWAP.HBD'],
  stableTokens: ['SWAP.HIVE', 'SWAP.HBD'],
  stablePair: 'SWAP.HIVE:SWAP.HBD',
  tokenSymbol: 'SWAP.BUSD',
  lowestAmountOutBound: 0.1,
  startIncomeDifference: 0,
  tokenPrecision: 8,
  approachCoefficient: 0.99,
  ourPool: false,
};

exports.PYRAMIDAL_BOTS = [
  BEE_HBD_HIVE,
  CENT_HBD_HIVE,
  BUSD_HBD_HIVE,
];

exports.SLIPPAGE = 0.0002;
