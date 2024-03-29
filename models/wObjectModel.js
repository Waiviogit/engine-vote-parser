const WObjectModel = require('database').models.WObject;
const { WOBJECT_LATEST_POSTS_COUNT } = require('constants/wobjectsData');

const create = async (data) => {
  const newWObject = new WObjectModel(data);

  try {
    return { wObject: await newWObject.save() };
  } catch (error) {
    return { error };
  }
};

const update = async (conditions, updateData) => {
  try {
    const result = await WObjectModel.updateOne(conditions, updateData);
    return { result: result.nModified === 1 };
  } catch (error) {
    return { error };
  }
};

const updateMany = async (conditions, updateData) => {
  try {
    const result = await WObjectModel.updateMany(conditions, updateData);
    return { result: result.nModified };
  } catch (error) {
    return { error };
  }
};

const addField = async (data) => {
  try {
    const result = await WObjectModel.updateOne(
      { author_permlink: data.author_permlink },
      {
        $push: {
          fields: data.field,
        },
      },
    );
    return { result: result.nModified === 1 };
  } catch (error) {
    return { error };
  }
};

const addSearchFields = async ({ authorPermlink, newWords }) => {
  try {
    const result = await WObjectModel.updateOne(
      { author_permlink: authorPermlink },
      { $addToSet: { search: { $each: newWords } } },
    );
    return { result: result.nModified === 1 };
  } catch (error) {
    return { error };
  }
};

// data include: author, permlink, author_permlink, weight
const increaseFieldWeight = async ({
  authorPermlink, author, permlink, symbol, weight,
}) => {
  try {
    const result = await WObjectModel.updateOne({
      author_permlink: authorPermlink,
      'fields.author': author,
      'fields.permlink': permlink,
    }, {
      $inc: {
        [`fields.$.weight${symbol}`]: weight,
      },
    });
    return { result: result.nModified === 1 };
  } catch (error) {
    return { error };
  }
};

// data include: author, permlink, author_permlink, voter
const removeVote = async (data) => {
  try {
    const result = await WObjectModel.updateOne({
      author_permlink: data.author_permlink,
      'fields.author': data.author,
      'fields.permlink': data.permlink,
    }, {
      $pull: {
        'fields.$.active_votes': { voter: data.voter },
      },
    });
    return { result: result.nModified === 1 };
  } catch (error) {
    return { error };
  }
};

const getField = async (author, permlink, authorPermlink, match) => {
  try {
    const matchCase = match || { $match: { 'fields.author': author || /.*?/, 'fields.permlink': permlink } };
    const [field] = await WObjectModel.aggregate([
      { $match: { author_permlink: authorPermlink || /.*?/ } },
      { $unwind: '$fields' },
      matchCase,
      { $replaceRoot: { newRoot: '$fields' } },
    ]);

    return { field };
  } catch (error) {
    return { error };
  }
};

// data include: author, permlink, author_permlink, voter, weight
const addVote = async ({
  field, author, permlink, authorPermlink, vote, existingVote,
}) => {
  try {
    if (!existingVote) {
      const result = await WObjectModel.updateOne(
        {
          author_permlink: authorPermlink,
          'fields.author': author,
          'fields.permlink': permlink,
        },
        { $push: { 'fields.$.active_votes': vote } },
      );
      return { result: result.nModified === 1 };
    }

    const wobject = await WObjectModel.findOne(
      {
        author_permlink: authorPermlink,
      },
    );

    for (const objField of wobject.fields) {
      if (objField._id.toString() === field._id.toString()) {
        for (const objVote of objField.active_votes) {
          if (objVote._id.toString() === existingVote._id.toString()) {
            Object.assign(objVote, vote);
            break;
          }
        }
        break;
      }
    }

    await wobject.save();

    return { result: true };
  } catch (error) {
    return { error };
  }
};

// method for redis restore wobjects author and author_permlink
const getWobjectsRefs = async () => {
  try {
    return {
      wobjects: await WObjectModel.aggregate([
        { $project: { _id: 0, author_permlink: 1, author: 1 } },
      ]),
    };
  } catch (error) {
    return { error };
  }
};

// method for redis restore fields author and author_permlink
const getFieldsRefs = async (authorPermlink) => {
  try {
    return {
      fields: await WObjectModel.aggregate([
        { $match: { author_permlink: authorPermlink } },
        { $unwind: '$fields' },
        { $addFields: { field_author: '$fields.author', field_permlink: '$fields.permlink' } },
        { $project: { _id: 0, field_author: 1, field_permlink: 1 } },
      ]),
    };
  } catch (error) {
    return { error };
  }
};

const getSomeFields = async (fieldName, authorPermlink, fieldFlag = false) => {
  const pipeline = [
    { $match: { author_permlink: authorPermlink || /.*?/ } },
    { $unwind: '$fields' },
    { $match: { 'fields.name': fieldName || /.*?/ } },
    { $sort: { 'fields.weight': -1 } },
    { $group: { _id: '$author_permlink', fields: { $push: '$fields.body' } } },
    { $project: { _id: 0, author_permlink: '$_id', fields: 1 } },
  ];
  if (fieldName === 'status') {
    pipeline[2].$match['fields.weight'] = { $gt: 0 };
  }
  if (fieldFlag) {
    pipeline[4].$group.fields = {
      $push: { body: '$fields.body', active_votes: '$fields.active_votes', weight: '$fields.weight' },
    };
  }
  try {
    const wobjects = await WObjectModel.aggregate(pipeline);

    return { wobjects };
  } catch (error) {
    return { error };
  }
};

const updateField = async (author, permlink, authorPermlink, key, value) => {
  try {
    const result = await WObjectModel.updateOne(
      { author_permlink: authorPermlink, 'fields.author': author, 'fields.permlink': permlink },
      { $set: { [`fields.$.${key}`]: value } },
    );
    return { result: result.nModified === 1 };
  } catch (e) {
    return { error: e };
  }
};

const getOne = async ({ author_permlink: authorPermlink, select = {} }) => {
  try {
    const wobject = await WObjectModel.findOne({ author_permlink: authorPermlink }, select).lean();

    if (!wobject) {
      return { error: { status: 404, message: 'Wobject not found!' } };
    }
    return { wobject };
  } catch (e) {
    return { error: e };
  }
};

const getMany = async ({ condition, select }) => {
  try {
    const result = await WObjectModel.find(condition).select(select).lean();

    if (!result) {
      return { error: { status: 404, message: 'Wobjects not found!' } };
    }
    return { wobjects: result };
  } catch (error) {
    return { error };
  }
};

const pushNewPost = async ({ author_permlink: authorPermlink, post_id: postId }) => {
  try {
    const result = await WObjectModel.updateOne({ author_permlink: authorPermlink }, {
      $push: {
        latest_posts: {
          $each: [postId],
          $position: 0,
          $slice: WOBJECT_LATEST_POSTS_COUNT,
        },
      },
      $inc: { count_posts: 1, last_posts_count: 1 },
    });
    return { result: result.nModified === 1 };
  } catch (e) {
    return { error: e };
  }
};

const find = async ({
  condition, select, sort = {}, skip = 0, limit,
}) => {
  try {
    return {
      result: await WObjectModel
        .find(condition, select)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
    };
  } catch (error) {
    return { error };
  }
};

module.exports = {
  find,
  getOne,
  create,
  update,
  addField,
  addSearchFields,
  increaseFieldWeight,
  removeVote,
  addVote,
  getWobjectsRefs,
  getFieldsRefs,
  getSomeFields,
  getField,
  updateField,
  pushNewPost,
  updateMany,
  getMany,
};
