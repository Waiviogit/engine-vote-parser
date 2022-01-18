const { setExpertise } = require('./setUserExpertise');

(async () => {
  await setExpertise();
  process.exit();
})();
