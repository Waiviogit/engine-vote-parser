const express = require('express');
const logger = require('morgan');
const dotenv = require('dotenv');

dotenv.config({ path: `env/.env.${process.env.NODE_ENV || 'development'}` });
require('jobs');

const { runEngineStream } = require('processor/processor');

const app = express();

app.use(logger('dev'));

runEngineStream().catch((err) => {
  console.log(err);
  process.exit(1);
});

module.exports = app;
