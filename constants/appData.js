const getAppData = () => ({
  appName: process.env.APP_NAME || 'waiviodev',
});

const objectImportService = {
  production: {
    IMPORT_OBJECTS_SERVICE_HOST_URL: 'https://www.waivio.com/import-objects-service',
    IMPORT_TAGS_ROUTE: '/import-tags',
    IMPORT_UPDATES_ROUTE: '/import-wobjects',
  },
  staging: {
    IMPORT_OBJECTS_SERVICE_HOST_URL: 'https://waiviodev.com/import-objects-service',
    IMPORT_TAGS_ROUTE: '/import-tags',
    IMPORT_UPDATES_ROUTE: '/import-wobjects',
  },
  development: {
    IMPORT_OBJECTS_SERVICE_HOST_URL: 'http://localhost:8085/import-objects-service',
    IMPORT_TAGS_ROUTE: '/import-tags',
    IMPORT_UPDATES_ROUTE: '/import-wobjects',
  },
  test: {
    IMPORT_OBJECTS_SERVICE_HOST_URL: 'http://localhost:8085/import-objects-service',
    IMPORT_TAGS_ROUTE: '/import-tags',
    IMPORT_UPDATES_ROUTE: '/import-wobjects',
  },
};

const waivioApi = {
  production: {
    HOST: 'https://www.waivio.com',
    BASE_URL: '/api',
    IMPORT_STEEM_USER_ROUTE: '/import_steem_user',
  },
  staging: {
    HOST: 'https://waiviodev.com',
    BASE_URL: '/api',
    IMPORT_STEEM_USER_ROUTE: '/import_steem_user',
  },
  development: {
    HOST: 'http://localhost:3000',
    BASE_URL: '/api',
    IMPORT_STEEM_USER_ROUTE: '/import_steem_user',
  },
  test: {
    HOST: 'http://localhost:3000',
    BASE_URL: '/api',
    IMPORT_STEEM_USER_ROUTE: '/import_steem_user',
  },
};

const notificationsApi = {
  production: {
    HOST: 'https://www.waivio.com',
    BASE_URL: '/notifications-api',
    SET_NOTIFICATION: '/set',
    STATUS: ['relisted', 'nsfw', 'unavailable'],
    WS: 'wss://www.waivio.com',
    WS_SET_NOTIFICATION: 'setNotification',
  },
  staging: {
    HOST: 'https://waiviodev.com',
    BASE_URL: '/notifications-api',
    SET_NOTIFICATION: '/set',
    STATUS: ['relisted', 'nsfw', 'unavailable'],
    WS: 'wss://waiviodev.com',
    WS_SET_NOTIFICATION: 'setNotification',
  },
  development: {
    HOST: 'http://localhost:4000',
    BASE_URL: '/notifications-api',
    SET_NOTIFICATION: '/set',
    STATUS: ['relisted', 'nsfw', 'unavailable'],
    WS: 'ws://localhost:4000',
    WS_SET_NOTIFICATION: 'setNotification',
  },
  test: {
    HOST: 'http://localhost:4000',
    BASE_URL: '/notifications-api',
    SET_NOTIFICATION: '/set',
    STATUS: ['relisted', 'nsfw', 'unavailable'],
    WS: 'ws://localhost:4000',
    WS_SET_NOTIFICATION: 'setNotification',
  },
};

// valid urls of HIVE nodes for getting blocks with transactions.
// Average speed for requests from Europe.
const COMMON_RPC_NODES = [
  'https://api.openhive.network', // 30 - 70 = 50ms
  'https://rpc.ecency.com', // 30 - 80 = 55ms
  'https://hive-api.arcange.eu', // 40 - 100 = 70ms
  'https://rpc.ausbit.dev', // 90 - 180 = 135ms
  'https://anyx.io', // 270 - 500 = 385ms
  'https://api.hive.blog', // 270 - 600 = 435ms
];

const HIVED_NODES = [
  'https://blocks.waivio.com',
  ...COMMON_RPC_NODES,
];

const HIVE_MIND_NODES = [
  'https://blocks.waivio.com:8082',
  ...COMMON_RPC_NODES,
];

const HIVE_ENGINE_NODES = [
  'https://engine.deathwing.me',
  'https://he.sourov.dev',
  'https://ha.herpc.dtools.dev',
  'https://herpc.actifit.io',
];

const REFERRAL_TYPES = {
  REWARDS: 'rewards',
  REVIEWS: 'reviews',
  INVITE_FRIEND: 'invite_friend',
};

const REFERRAL_STATUSES = {
  NOT_ACTIVATED: 'notActivated',
  ACTIVATED: 'activated',
  REJECTED: 'rejected',
};

const telegramApi = {
  HOST: 'https://waiviodev.com',
  BASE_URL: '/telegram-api',
  SENTRY_ERROR: '/sentry',
  BOT_RC: '/bot-rc',
};

const BLOCK_REQ_MAX_TIME = 1000;

module.exports = {
  telegramApi,
  getAppData,
  objectImportService: objectImportService[process.env.NODE_ENV || 'development'],
  waivioApi: waivioApi[process.env.NODE_ENV || 'development'],
  notificationsApi: notificationsApi[process.env.NODE_ENV || 'development'],
  REFERRAL_TYPES,
  REFERRAL_STATUSES,
  BLOCK_REQ_MAX_TIME,
  HIVED_NODES,
  HIVE_MIND_NODES,
  HIVE_ENGINE_NODES,
  COMMON_RPC_NODES,
};
