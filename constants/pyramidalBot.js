const BEE_HBD_HIVE = {
  // будет ссылка на енв
  account: 'jessihollander',
  // будет ссылка на енв
  key: '5J1cic3kmk8HFYDpWupexT9Q8vUckECCoFx9ntRDtPfzFHqP2To',
  tokenPairs: ['SWAP.HIVE:BEE', 'BEE:SWAP.HBD', 'SWAP.HIVE:SWAP.HBD'],
  stableTokens: ['SWAP.HIVE', 'SWAP.HBD'],
  stablePair: 'SWAP.HIVE:SWAP.HBD',
  tokenSymbol: 'BEE',
  startAmountIn: 500,
};

const CENT_HBD_HIVE = {
  // будет ссылка на енв
  account: 'jessihollander',
  // будет ссылка на енв
  key: '5J1cic3kmk8HFYDpWupexT9Q8vUckECCoFx9ntRDtPfzFHqP2To',
  tokenPairs: ['SWAP.HIVE:CENT', 'SWAP.HBD:CENT', 'SWAP.HIVE:SWAP.HBD'],
  stableTokens: ['SWAP.HIVE', 'SWAP.HBD'],
  stablePair: 'SWAP.HIVE:SWAP.HBD',
  tokenSymbol: 'CENT',
};

exports.PYRAMIDAL_BOTS = [
  BEE_HBD_HIVE,
  //CENT_HBD_HIVE,
];
