const { dropDatabase, redis, Mongoose } = require('./testHelper');

before(async () => {
  await Mongoose.connection.dropDatabase();
});

beforeEach(async () => {
  await dropDatabase();
  await redis.postRefsClient.flushdbAsync();
});
