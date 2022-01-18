const { Wobj } = require('models');
const _ = require('lodash');
const calculateEngineExpertise = require('utilities/helpers/calculateEngineExpertise');

let skip = 0;
exports.setExpertise = async () => {
  const { result } = (await Wobj.find({
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
    await Wobj.update(
      { _id: resultElement._id },
      { $inc: formatedExpertise },
    );
  }
  skip += result.length;
  console.log(`${skip} records updated `);

  await this.setExpertise();
};