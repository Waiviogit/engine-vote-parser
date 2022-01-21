const { setExpertise } = require('./setWobjExpertise');

(async () => {
  await setExpertise(process.argv[2]);
  process.exit();
})();
