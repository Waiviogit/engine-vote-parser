const { setExpertise } = require('./setUserWobjExpertise');

(async () => {
  const tokenSymbol = process.argv[2];
  const direction = process.argv[3];
  await setExpertise(tokenSymbol, direction);
  process.exit();
})();
