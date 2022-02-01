const _ = require('lodash');
const calculateEngineExpertise = require('utilities/helpers/calculateEngineExpertise');
const appHelper = require('utilities/helpers/appHelper');
const { User } = require('../../../models');

let skip = 0;
exports.setExpertise = async (tokenSymbol) => {
  const { result } = await User.find({
    condition: { $and: [{ expertiseWAIV: { $exists: true } }, { expertiseWAIV: { $gt: 0 } }, { processed: { $exists: false } }] },
    select: { expertiseWAIV: 1, _id: 1, name: 1 },
    limit: 1000,
    skip,
  });
  if (_.isEmpty(result)) {
    console.log('task completed');
    process.exit();
  }
  const { users } = await appHelper.getBlackListUsers();
  for (const resultElement of result) {
    if (users.includes(resultElement.name)) continue;
    const generalWAIVexpertise = _.get(resultElement, tokenSymbol);
    const formatedExpertise = (await calculateEngineExpertise(generalWAIVexpertise, tokenSymbol));
    await User.update(
      { _id: resultElement._id },
      { $inc: { wobjects_weight: formatedExpertise }, processed: true },
    );
  }
  skip += result.length;
  console.log(`${skip} records updated `);
  await this.setExpertise(tokenSymbol);
};
