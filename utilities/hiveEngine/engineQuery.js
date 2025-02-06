const axios = require('axios');
const _ = require('lodash');
const { setTimeout } = require('timers');
const { HIVE_ENGINE_NODES } = require('../../constants/appData');

const createTimeout = (promise, timeout) => new Promise((resolve, reject) => {
  setTimeout(() => {
    reject(new Error(`Request has timed out. It should take no longer than ${timeout}ms.`));
  }, timeout);
  promise.then(resolve, reject);
});

exports.engineQuery = async ({
  hostUrl = 'https://api.primersion.com',
  method = 'find',
  params,
  endpoint = '/contracts',
  id = 'ssc-mainnet-hive',
}) => {
  try {
    const request = axios.post(
      `${hostUrl}${endpoint}`,
      {
        jsonrpc: '2.0',
        method,
        params,
        id,
      },
      {
        timeout: 5000,
      },
    );

    const resp = await createTimeout(request, 5000);

    return _.get(resp, 'data.result');
  } catch (error) {
    return { error };
  }
};

exports.engineProxy = async ({
  hostUrl,
  method,
  params,
  endpoint,
  id,
  attempts = 5,
}) => {
  const response = await this.engineQuery({
    hostUrl,
    method,
    params,
    endpoint,
    id,
  });
  if (_.has(response, 'error')) {
    if (attempts <= 0) return response;
    return this.engineProxy({
      hostUrl: getNewNodeUrl(hostUrl),
      method,
      params,
      endpoint,
      id,
      attempts: attempts - 1,
    });
  }
  return response;
};

const getNewNodeUrl = (hostUrl) => {
  const index = hostUrl ? HIVE_ENGINE_NODES.indexOf(hostUrl) : 0;

  return index === HIVE_ENGINE_NODES.length - 1
    ? HIVE_ENGINE_NODES[0]
    : HIVE_ENGINE_NODES[index + 1];
};
