const moment = require('moment');
const {
  UNIX_TIMESTAMP_CONVERTER,
} = require('../../constants/bookBot');
const { closeNoFundOrExpiringOrders } = require('./closeNoFundOrExpiringOrdersHelper');

const checkIfOrderExpiresTomorrow = (expirationDate) => {
  const expirationDay = moment.utc(expirationDate).date();
  const expirationMonth = moment.utc(expirationDate).add(1, 'month').month();
  const expirationYear = moment.utc(expirationDate).year();

  const currentDay = moment.utc().date();
  const currentMonth = moment.utc().month() + 1;
  const currentYear = moment.utc().year();

  const usualTomorrow = currentDay + 1 === expirationDay && currentMonth === expirationMonth
    && currentYear === expirationYear;

  const newMonthTomorrow = (currentDay > expirationDay && expirationDay === 1)
    && expirationMonth === currentMonth + 1 && currentYear === expirationYear;

  const newYearTomorrow = (currentDay > expirationDay && expirationDay === 1)
    && (currentMonth > expirationMonth && expirationMonth === 1)
    && expirationYear === currentYear + 1;

  if (usualTomorrow || newMonthTomorrow || newYearTomorrow) return true;

  return false;
};

exports.handleOrders = async ({ book, type, bookBot }) => {
  const ordersExpiringTomorrow = book.filter((order) => checkIfOrderExpiresTomorrow(
    order.expiration * UNIX_TIMESTAMP_CONVERTER,
  ));
  if (ordersExpiringTomorrow.length) {
    return closeNoFundOrExpiringOrders({
      orders: ordersExpiringTomorrow,
      type,
      bookBot,
    });
  }
};
