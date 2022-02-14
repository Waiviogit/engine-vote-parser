const express = require('express');
const logger = require('morgan');
require('jobs');
require('utilities/bookBot/bookBot');

const { runEngineStream } = require('processor/processor');

const app = express();

app.use(logger('dev'));

runEngineStream().catch((err) => {
  console.log(err);
  process.exit(1);
});

module.exports = app;
