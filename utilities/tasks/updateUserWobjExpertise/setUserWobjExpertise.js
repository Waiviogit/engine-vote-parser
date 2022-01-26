const { UserWobjects } = require('models');
const _ = require('lodash');
const calculateEngineExpertise = require('utilities/helpers/calculateEngineExpertise');

let skip = 0;
exports.setExpertise = async (tokenSymbol) => {
  const { result } = await UserWobjects.find({
    condition: { $and: [{ expertiseWAIV: { $exists: true } }, { expertiseWAIV: { $gt: 0 } }, { processed: { $exists: false } }] },
    select: { expertiseWAIV: 1, _id: 1 },
    limit: 1000,
    skip,
  });
  if (_.isEmpty(result)) {
    console.log('task completed');
    process.exit();
  }
  for (const resultElement of result) {
    const generalWAIVexpertise = _.get(resultElement, tokenSymbol);
    const formatedExpertise = (await calculateEngineExpertise(generalWAIVexpertise, tokenSymbol));
    await UserWobjects.updateOne(
      { _id: resultElement._id },
      { $inc: { weight: formatedExpertise }, processed: true },
    );
  }
  skip += result.length;
  console.log(`${skip} records updated `);

  await this.setExpertise(tokenSymbol);
};
