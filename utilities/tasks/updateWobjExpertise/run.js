const { setExpertise } = require('./setWobjExpertise');

(async () => {
  await setExpertise();
  process.exit();
})();
