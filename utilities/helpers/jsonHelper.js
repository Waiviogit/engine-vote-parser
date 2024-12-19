exports.parseJson = (json, onError = {}) => {
  try {
    return JSON.parse(json);
  } catch (error) {
    return onError;
  }
};
