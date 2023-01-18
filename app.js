const express = require('express');
const logger = require('morgan');
const dotenv = require('dotenv');
const Sentry = require('@sentry/node');
const Tracing = require('@sentry/tracing');
const sentryHelper = require('utilities/helpers/sentryHelper');

dotenv.config({ path: `env/.env.${process.env.NODE_ENV || 'development'}` });
require('jobs');

const { runEngineStream } = require('processor/processor');

const app = express();

Sentry.init({
  environment: process.env.NODE_ENV,
  dsn: process.env.SENTRY_DNS,
  integrations: [
    // enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // enable Express.js middleware tracing
    new Tracing.Integrations.Express({ app }),
  ],
});

app.use(logger('dev'));

runEngineStream().catch((error) => {
  sentryHelper.captureException(error);
  console.error(error.message);
  process.exit(1);
});

process.on('unhandledRejection', (error) => sentryHelper.captureException(error));

module.exports = app;
