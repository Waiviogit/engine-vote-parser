const { Wobj } = require('models');
const _ = require('lodash');
const calculateEngineExpertise = require('utilities/helpers/calculateEngineExpertise');

let skip = 0;
exports.setExpertise = async (tokenSymbol, direction = 'up') => {
  const processedCondition = direction === 'up'
    ? { processed: { $exists: false } }
    : { processed: true };

  const { result } = await Wobj.find({
    condition: {
      $and: [
        { [`expertise${tokenSymbol}`]: { $exists: true } },
        { [`expertise${tokenSymbol}`]: { $gt: 0 } },
        processedCondition,
      ],
    },
    select: { [`expertise${tokenSymbol}`]: 1, _id: 1 },
    limit: 1000,
    skip,
  });
  if (_.isEmpty(result)) {
    console.log('task completed');
    process.exit();
  }
  for (const resultElement of result) {
    const generalExpertise = _.get(resultElement, tokenSymbol);
    const formattedExpertise = (await calculateEngineExpertise(generalExpertise, tokenSymbol));

    const updateCondition = direction === 'up'
      ? { $inc: { weight: formattedExpertise }, processed: true }
      : { $inc: { weight: -formattedExpertise }, processed: false };

    await Wobj.update(
      { _id: resultElement._id },
      updateCondition,
    );
  }
  skip += result.length;
  console.log(`${skip} records updated `);

  await this.setExpertise(tokenSymbol, direction);
};
