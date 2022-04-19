const { engineProxy } = require('utilities/hiveEngine/engineQuery');

exports.getSellBook = async ({ query }) => engineProxy({
  params: {
    contract: 'market',
    query,
    indexes: [
      {
        index: 'priceDec',
        descending: false,
      },
    ],
    limit: 1000,
    offset: 0,
    table: 'sellBook',
  },
});

exports.getBuyBook = async ({ query }) => engineProxy({
  params: {
    contract: 'market',
    query,
    indexes: [
      {
        index: 'priceDec',
        descending: true,
      },
    ],
    limit: 1000,
    offset: 0,
    table: 'buyBook',
  },
});
