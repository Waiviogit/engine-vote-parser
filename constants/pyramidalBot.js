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
  startMultiplier: 1.5,
};

exports.PYRAMIDAL_BOTS = [
  BEE_HBD_HIVE,
];

exports.SLIPPAGE = 0.005;

exports.TEST_POOLS = [
  {
    _id: 1,
    tokenPair: 'SWAP.HIVE:BEE',
    baseQuantity: '100000.09832820',
    baseVolume: '22069581.16176546',
    basePrice: '1.82112016',
    quoteQuantity: '184479.65186536',
    quoteVolume: '26913426.63883856',
    quotePrice: '0.54911258',
    totalShares: '135329.6567317075008915796',
    precision: 8,
    creator: 'hive-engine',
  },
  {
    _id: 4,
    tokenPair: 'SWAP.HIVE:SWAP.HBD',
    baseQuantity: '71835.39139943',
    baseVolume: '2082025.54136259',
    basePrice: '0.91508871',
    quoteQuantity: '65735.75598700',
    quoteVolume: '2470315.70190461',
    quotePrice: '1.09279022',
    totalShares: '67991.97742635761063774593',
    precision: 8,
    creator: 'eturnerx',
  },
  {
    _id: 25,
    tokenPair: 'BEE:SWAP.HBD',
    baseQuantity: '39945.97604625',
    baseVolume: '600374.54979849',
    basePrice: '0.50260486',
    quoteQuantity: '20077.04185607',
    quoteVolume: '411695.42115650',
    quotePrice: '1.98963454',
    totalShares: '28198.43224133187505718582',
    precision: 8,
    creator: 'hive-engine',
  },
];
