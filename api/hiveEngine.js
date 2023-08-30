const { redisGetter, redisSetter } = require('utilities/redis');
const blockchain = require('utilities/hiveEngine/blockchain');
const { HIVE_ENGINE_NODES } = require('constants/appData');
const _ = require('lodash');

let CURRENT_NODE = HIVE_ENGINE_NODES[0];

/**
 * Base method for run stream, for side tasks pass to the key parameter key for save block
 * num in redis, transactionsParserCallback - call back function
 * (it must be switcher for transactions), startFromCurrent - boolean
 * marker for start from the current block
 * @param startFromBlock {Number}
 * @param startFromCurrent {Boolean}
 * @param key {String}
 * @param finishBlock {Number}
 * @param transactionsParserCallback {Function}
 * @returns {Promise<boolean>}
 */
const getBlockNumberStream = async ({
  startFromBlock, startFromCurrent, key, finishBlock,
  transactionsParserCallback,
}) => {
  if (startFromCurrent) {
    await loadNextBlock(
      {
        key,
        finishBlock,
        transactionsParserCallback,
        startBlock: (await blockchain.getLatestBlockInfo()).blockNumber,
      },
    );
  } else if (startFromBlock && Number.isInteger(startFromBlock)) {
    await loadNextBlock({
      startBlock: startFromBlock, key, finishBlock, transactionsParserCallback,
    });
  } else {
    await loadNextBlock({ transactionsParserCallback, key });
  }
  return true;
};

const loadNextBlock = async ({
  startBlock, key = '', finishBlock, transactionsParserCallback,
}) => {
  let lastBlockNum;

  if (startBlock) {
    lastBlockNum = startBlock;
    if (finishBlock && startBlock >= finishBlock) {
      console.log('Task finished');
      return;
    }
  } else {
    lastBlockNum = await redisGetter.getLastBlockNum(key);
  }
  const loadResult = await loadBlock(lastBlockNum, transactionsParserCallback);

  if (loadResult) {
    await redisSetter.setLastBlockNum(lastBlockNum + 1, key);
    await loadNextBlock({
      startBlock: lastBlockNum + 1, key, transactionsParserCallback, finishBlock,
    });
  } else {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await loadNextBlock({
      startBlock: lastBlockNum, key, transactionsParserCallback, finishBlock,
    });
  }
};

const shouldWait = async ({ refHiveBlockNumber }) => {
  const lastVoteBlock = await redisGetter.getLastBlockNum('last_vote_block_num');
  const diff = lastVoteBlock - refHiveBlockNumber;

  return diff < 1;
};

// return true if block exist and parsed, else - false
const loadBlock = async (blockNum, transactionsParserCallback) => {
  const block = await blockchain.getBlockInfo(blockNum, CURRENT_NODE);

  if (_.has(block, 'error')) {
    console.error(block.error.message);
    changeNodeUrl();
    return false;
  }
  if (!block) return false;

  const wait = await shouldWait({ refHiveBlockNumber: block.refHiveBlockNumber });
  if (wait) return false;

  if (!block.transactions || !block.transactions[0]) {
    console.error(`EMPTY BLOCK: ${blockNum}`);
    return true;
  }
  console.time(`engine ${block.blockNumber}`);
  await transactionsParserCallback(block.transactions, block.blockNumber, block.timestamp);
  console.timeEnd(`engine ${block.blockNumber}`);
  return true;
};

const changeNodeUrl = () => {
  const index = HIVE_ENGINE_NODES.indexOf(CURRENT_NODE);

  CURRENT_NODE = index === HIVE_ENGINE_NODES.length - 1
    ? HIVE_ENGINE_NODES[0]
    : HIVE_ENGINE_NODES[index + 1];
  console.error(`Node URL was changed to ${CURRENT_NODE}`);
};

module.exports = {
  getBlockNumberStream,
};
