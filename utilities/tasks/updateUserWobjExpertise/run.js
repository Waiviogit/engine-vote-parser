const { setExpertise } = require('./setUserWobjExpertise');

(async () => {
  await setExpertise(process.argv[2]);
  process.exit();
})();
