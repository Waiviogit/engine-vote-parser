exports.getTokenPrecisionQuantity = (precision) => {
  let string = '0.';
  for (let i = 0; i < precision; i++) {
    if (i === precision - 1) {
      string += '9';
      continue;
    }
    string += '0';
  }
  return string;
};
