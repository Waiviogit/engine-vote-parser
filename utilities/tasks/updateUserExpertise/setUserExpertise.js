const _ = require('lodash');
const calculateEngineExpertise = require('utilities/helpers/calculateEngineExpertise');
const { User } = require('../../../models');

let skip = 0;
exports.setExpertise = async () => {
  const { result } = (await User.find({
    condition: { $and: [{ expertiseWAIV: { $exists: true } }, { expertiseWAIV: { $gt: 0 } }] },
    select: { expertiseWAIV: 1, _id: 1 },
    limit: 1000,
    skip,
  }));
  if (_.isEmpty(result)) {
    console.log('task completed');
    process.exit();
  }
  for (const resultElement of result) {
    const generalWAIVexpertise = _.get(resultElement, 'expertiseWAIV');
    const formatedExpertise = (await calculateEngineExpertise(generalWAIVexpertise, 0));
    await User.update(
      { _id: resultElement._id },
      { $inc: { wobjects_weight: formatedExpertise.weight } },
    );
  }
  skip += result.length;
  await this.setExpertise();
  console.log(`${skip} records updated `);

};
