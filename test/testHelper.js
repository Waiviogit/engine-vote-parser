const chai = require('chai');
const { ObjectID } = require('bson');
const sinonChai = require('sinon-chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
chai.use(sinonChai);
const { expect } = chai;
const faker = require('faker');
const config = require('config');
const { Mongoose } = require('database');
const moment = require('moment');

faker.random.string = (length = 5) => faker.internet.password(length, false, /[a-z]/);

const dropDatabase = async () => {
  const { models } = require('../database');
  for (const model in models) {
    await models[model].deleteMany();
  }
};
module.exports = {
  ...require('utilities/redis'),
  sinon: require('sinon'),
  ObjectID,
  expect,
  moment,
  config,
  Mongoose,
  faker,
  chai,
  dropDatabase,
};
