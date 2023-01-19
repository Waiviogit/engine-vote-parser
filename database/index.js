const mongoose = require('mongoose');
const config = require('config');

const URI = `mongodb://${config.db.host}:${config.db.port}/${config.db.database}`;

mongoose.connect(URI, {
  useNewUrlParser: true, useFindAndModify: false, useCreateIndex: true, useUnifiedTopology: true,
})
  .then(() => console.log('connection successful!'))
  .catch((error) => console.error(error));

mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error:'));

mongoose.Promise = global.Promise;

module.exports = {
  Mongoose: mongoose,
  models: {
    WObject: require('./schemas/wObjectSchema'),
    User: require('./schemas/UserSchema'),
    Post: require('./schemas/PostSchema'),
    App: require('./schemas/AppSchema'),
    EngineAccountHistory: require('./schemas/EngineAccountHistorySchema'),
    UserWobjects: require('./schemas/UserWobjectsSchema'),
    CommentRef: require('./schemas/CommentRefSchema'),
    GuestWallet: require('./schemas/GuestWalletSchema'),
    WebsitePayments: require('./schemas/WebsitePaymentsSchema'),
    WebsitesRefund: require('./schemas/WebsiteRefudSchema'),
  },
};
