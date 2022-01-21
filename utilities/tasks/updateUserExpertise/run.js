const { setExpertise } = require('./setUserExpertise');

(async () => {
  await setExpertise(process.argv[2]);
  process.exit();
})();
