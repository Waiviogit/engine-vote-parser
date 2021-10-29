const express = require('express');
const logger = require('morgan');

const { runStream } = require('processor/processor');


const app = express();


app.use(logger('dev'));

runStream().catch((err) => {
  console.log(err);
  process.exit(1);
});


module.exports = app;
