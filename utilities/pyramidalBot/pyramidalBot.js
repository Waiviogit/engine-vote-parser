const _ = require('lodash');
const BigNumber = require('bignumber.js');
const { PYRAMIDAL_BOTS } = require('../../constants/pyramidalBot');
const { validatePyramidalBot } = require('./helpers/validatePyramidalBotHelper');
const enginePool = require('../hiveEngine/marketPools');
const { POOL_FEE } = require('../../constants/bookBot');
const poolSwapHelper = require('../bookBot/helpers/poolSwapHelper');
const { bookBroadcastToChain } = require('../bookBot/helpers/bookBroadcastToChainHelper');
const tokensContract = require('../hiveEngine/tokensContract');

exports.startPyramidalBot = async (tokenPair) => {
  const pyramidalBot = _.find(PYRAMIDAL_BOTS,
    (bot) => _.includes(bot.tokenPairs, tokenPair));
  console.log('pyramidalBot', pyramidalBot);
  if (!pyramidalBot) return;

  if (!validatePyramidalBot(pyramidalBot)) {
    return console.error(`Invalid ${pyramidalBot.account} bot params`);
  }

  await handleSwaps(_.cloneDeep(pyramidalBot));
};

const handleSwaps = async (bot) => {
  const requests = await Promise.all([
    enginePool.getMarketPools({
      query: { tokenPair: { $in: bot.tokenPairs } },
    }),
    enginePool.getMarketPoolsParams(),
    tokensContract.getTokensParams({
      query: {
        symbol: {
          $in:
            [bot.tokenSymbol, ...bot.stableTokens],
        },
      },
    }),
  ]);
  // заюзать позже токены чтоб взять их присижены...или вынести в константы? лучше с запроса наверно
  const [pools, params, tokens] = requests;
  if (_.has(pools, 'error') || _.has(params, 'error') || _.has(tokens, 'error')) {
    console.error('-------error in pyramidalBot request');

    return;
  }

  const tradeFeeMul = _.get(params, '[0].tradeFeeMul', POOL_FEE);
  const poolsWithToken = _.filter(pools, (pool) => !_.includes(
    bot.stablePair,
    pool.tokenPair,
  ));
  console.log('poolsWithToken', poolsWithToken);
  const stablePool = _.find(pools, (pool) => _.includes(bot.stablePair, pool.tokenPair));
  const poolToBuy = getPoolToSwap({
    pools: poolsWithToken,
    bot,
    buy: true,
    stablePool,
  });
  // sell BEE, buy HIVE
  console.log('poolToBuy', poolToBuy);
  const poolToSell = getPoolToSwap({ pools: poolsWithToken, bot, stablePool });
  console.log('poolToSell', poolToSell);
  const operations = [];
  operations.push({
    contractName: 'marketpools',
    contractAction: 'swapTokens',
    contractPayload: {
      tokenPair: 'SWAP.HIVE:BEE',
      tokenSymbol: 'SWAP.HIVE',
      tokenAmount: '0.12207032',
      tradeType: 'exactInput',
      minAmountOut: '0.21703233'
    }
  });
  operations.push( {
    contractName: 'marketpools',
    contractAction: 'swapTokens',
    contractPayload: {
      tokenPair: 'BEE:SWAP.HBD',
      tokenSymbol: 'BEE',
      tokenAmount: '0.21812570',
      tradeType: 'exactInput',
      minAmountOut: '0.10897233'
    }
  });
  operations.push({
    contractName: 'marketpools',
    contractAction: 'swapTokens',
    contractPayload: {
      tokenPair: 'SWAP.HIVE:SWAP.HBD',
      tokenSymbol: 'SWAP.HBD',
      tokenAmount: '0.10952131',
      tradeType: 'exactInput',
      minAmountOut: '0.12149348'
    }
  });
  // че тут внутри?!
  // getOperationsToBroadcast({
  //   poolToBuy, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool, operations,
  // });
  // console.log('operations before splice', operations);
  // if ((_.find(operations, (operation) => _.isEmpty(operation)))) return;

  // if (operations.length) {
  //   operations.splice(3, operations.length - 3);
  //   console.log('operations', operations);
    await bookBroadcastToChain({ bookBot: bot, operations });
  //}
};

const getPoolToSwap = ({
  pools, bot, buy = false, stablePool,
}) => {
  const dataToCompare = [];
  const [stableBase] = stablePool.tokenPair.split(':');

  for (const pool of pools) {
    const [base, quote] = pool.tokenPair.split(':');
    base === bot.tokenSymbol
      ? dataToCompare.push({
        coefficient: pool.tokenPair.includes(stableBase)
          ? BigNumber(pool.basePrice).multipliedBy(stablePool.basePrice)
            .toFixed(stablePool.precision)
          : BigNumber(pool.basePrice).multipliedBy(stablePool.quotePrice)
            .toFixed(stablePool.precision),
        tokenPair: pool.tokenPair,
        stableTokenSymbol: quote,
      })
      : dataToCompare.push({
        coefficient: pool.tokenPair.includes(stableBase)
          ? BigNumber(pool.quotePrice).multipliedBy(stablePool.basePrice)
            .toFixed(stablePool.precision)
          : BigNumber(pool.quotePrice).multipliedBy(stablePool.quotePrice)
            .toFixed(stablePool.precision),
        tokenPair: pool.tokenPair,
        stableTokenSymbol: base,
      });
  }

  return buy ? dataToCompare
    .reduce((acc, current) => (acc.coefficient < current.coefficient ? acc : current))
    : dataToCompare
      .reduce((acc, current) => (acc.coefficient > current.coefficient ? acc : current));
};

const getOperationsToBroadcast = ({
  poolToBuy, poolsWithToken, tradeFeeMul, bot, poolToSell, stablePool, operations,
  startAmountIn = bot.startAmountIn,
}) => {
  if (BigNumber(startAmountIn).isLessThan(0.1)) return;

  console.log('startAmountIn', startAmountIn);
  const tokenOutput = poolSwapHelper.getSwapOutput({
    // тут би должен быть который беру? или хайв который продаю??? проверить!
    symbol: poolToBuy.stableTokenSymbol,
    amountIn: startAmountIn,
    pool: _.find(poolsWithToken, (pool) => pool.tokenPair.includes(poolToBuy.tokenPair)),
    // можно вынести в константу
    slippage: 0.005,
    // если сделать не тру?
    from: true,
    tradeFeeMul,
    // берем precision того токена на который меняем если фром фолс, если тру - присижн того токена с которого меняем
    precision: _.find(poolsWithToken, (pool) => pool.tokenPair
      .includes(poolToBuy.tokenPair)).precision,
  });
  // почему-то уже ничерта не выгодно...
  // тут должен быть amountOut or minAmountOut?
  const tokenOut = _.get(tokenOutput, 'amountOut');

  const stableTokenOutput = poolSwapHelper.getSwapOutput({
    symbol: bot.tokenSymbol,
    amountIn: tokenOut,
    pool: _.find(poolsWithToken, (pool) => pool.tokenPair.includes(poolToSell.tokenPair)),
    // можно вынести в константу
    slippage: 0.005,
    from: true,
    tradeFeeMul,
    // берем precision того токена на который меняем если фром фолс, если тру - присижн того токена с которого меняем
    precision: _.find(poolsWithToken, (pool) => pool.tokenPair
      .includes(poolToSell.tokenPair)).precision,
  });
  // тут должен быть amountOut or minAmountOut?
  const stableTokenOut = _.get(stableTokenOutput, 'amountOut');

  const equalizeTokensOutput = poolSwapHelper.getSwapOutput({
    symbol: poolToSell.stableTokenSymbol,
    amountIn: stableTokenOut,
    pool: stablePool,
    // можно вынести в константу
    slippage: 0.005,
    from: true,
    tradeFeeMul,
    // берем precision того токена на который меняем если фром фолс, если тру - присижн того токена с которого меняем
    precision: stablePool.precision,
  });

  // if (BigNumber(equalizeTokensOutput.amountOut).isLessThan(startAmountIn) && BigNumber(startAmountIn).isGreaterThan(0.1)) {
  //   console.log('inside if');
  //   getOperationsToBroadcast({
  //     poolToBuy,
  //     poolsWithToken,
  //     tradeFeeMul,
  //     bot,
  //     poolToSell,
  //     stablePool,
  //     operations,
  //     startAmountIn: BigNumber(startAmountIn)
  //       .dividedBy(2)
  //       .toFixed(8),
  //   });
  // }
  // if (BigNumber(startAmountIn).isLessThan(0.1)) {
  //   operations.push({});
  //
  //   return;
  // }

  console.log('equalizeTokensOutput.amountOut', equalizeTokensOutput.amountOut);
  if (BigNumber(equalizeTokensOutput.amountOut).isGreaterThan(startAmountIn) && !BigNumber(startAmountIn).isLessThan(0.1)) {
    // это пока закомментить...потом раскоменчу... как определить когда остановиться опсле того как пошли вверх
    // сделать какой-то флаг что сделали шаг вверх! (умножили на полтора) - нашли идеальную сумму?
    // getOperationsToBroadcast({
    //   poolToBuy,
    //   poolsWithToken,
    //   tradeFeeMul,
    //   bot,
    //   poolToSell,
    //   stablePool,
    //   operations,
    //   startAmountIn: BigNumber(startAmountIn).multipliedBy(1.5).toFixed(8),
    // });

     // опробовать не пушить (чтоб был не большой массив, а присвоить каждому элементу число нвоое!
    operations.push(tokenOutput.json, stableTokenOutput.json, equalizeTokensOutput.json);

    getOperationsToBroadcast({
      poolToBuy,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
      operations,
      startAmountIn: BigNumber(startAmountIn)
        .dividedBy(2)
        .toFixed(8),
    });
  }

  if (BigNumber(equalizeTokensOutput.amountOut).isLessThan(startAmountIn) && !operations.length) {
    getOperationsToBroadcast({
      poolToBuy,
      poolsWithToken,
      tradeFeeMul,
      bot,
      poolToSell,
      stablePool,
      operations,
      startAmountIn: BigNumber(startAmountIn)
        .dividedBy(2)
        .toFixed(8),
    });
  }
};
