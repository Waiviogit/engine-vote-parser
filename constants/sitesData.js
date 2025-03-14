exports.STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
};

exports.SUPPORTED_COLORS = {
  BACKGROUND: 'background',
  FONT: 'font',
  HOVER: 'hover',
  HEADER: 'header',
  BUTTON: 'button',
  BORDER: 'border',
  FOCUS: 'focus',
  LINKS: 'links',
};

exports.PAYMENT_TYPES = {
  TRANSFER: 'transfer',
  CREDIT: 'credit', // special type admin can give credits to site
  WRITE_OFF: 'writeOff',
  REFUND: 'refund',
};

exports.TRANSFER_ID = 'websitesPayment';
exports.TRANSFER_GUEST_ID = 'websitesPaymentGuest';
exports.REFUND_ID = 'websitesRefund';

exports.FEE = {
  currency: 'WAIV',
  account: 'waivio.web',
};

exports.REFUND_TYPES = {
  WEBSITE_REFUND: 'website_refund',
};

exports.REFUND_STATUSES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  FROZEN: 'frozen',
};

exports.PARSE_MATCHING = {
  [this.TRANSFER_ID]: this.PAYMENT_TYPES.TRANSFER,
  [this.REFUND_ID]: this.PAYMENT_TYPES.REFUND,
};
