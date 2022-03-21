const { UserWobjects } = require('models');
const _ = require('lodash');
const calculateEngineExpertise = require('utilities/bookBot/helpers/calculateEngineExpertise');
const appHelper = require('utilities/bookBot/helpers/appHelper');

let blackList = [];
const getBlackList = async () => {
  if (_.isEmpty(blackList)) {
    ({ users: blackList } = await appHelper.getBlackListUsers());
    return blackList;
  }
  return blackList;
};

let records = 0;
exports.setExpertise = async (tokenSymbol, direction = 'up') => {
  const processedCondition = direction === 'up'
    ? { processed: false }
    : { processed: true };

  const { result } = await UserWobjects.find({
    condition: {
      $and: [
        { [`expertise${tokenSymbol}`]: { $gt: 0 } },
        processedCondition,
      ],
    },
    select: { [`expertise${tokenSymbol}`]: 1, _id: 1, user_name: 1 },
    limit: 1000,
  });
  if (_.isEmpty(result)) {
    console.log('task completed');
    process.exit();
  }
  for (const resultElement of result) {
    const blacklistUsers = await getBlackList();
    if (blacklistUsers.includes(resultElement.user_name)) {
      await UserWobjects.updateOne(
        { _id: resultElement._id },
        { processed: true, [`expertise${tokenSymbol}`]: 0 },
      );
      continue;
    }
    const generalExpertise = _.get(resultElement, `expertise${tokenSymbol}`);
    const formattedExpertise = (await calculateEngineExpertise(generalExpertise, tokenSymbol));

    const updateCondition = direction === 'up'
      ? { $inc: { weight: formattedExpertise }, processed: true }
      : { $inc: { weight: -formattedExpertise }, processed: false };

    await UserWobjects.updateOne(
      { _id: resultElement._id },
      updateCondition,
    );
  }

  console.log(`${records += result.length} records updated `);

  await this.setExpertise(tokenSymbol, direction);
};
