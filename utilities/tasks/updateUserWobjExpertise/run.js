const { setExpertise } = require('./setUserWobjExpertise');

(async () => {
  await setExpertise();
  process.exit();
})();
