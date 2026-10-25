// Status values to a label and a marker (section 7, Status markers). The view
// draws the marker the presenter names; the label always comes with it, so
// colour is never the only clue.

const ORDER = {
  pending: { label: 'Pending', marker: 'hollow', tone: 'neutral' },
  open: { label: 'Open', marker: 'solid', tone: 'neutral' },
  partially_filled: { label: 'Partly filled', marker: 'half', tone: 'wait' },
  filled: { label: 'Filled', marker: 'tick', tone: 'buy' },
  cancelled: { label: 'Cancelled', marker: 'dash', tone: 'muted' },
  rejected: { label: 'Rejected', marker: 'cross', tone: 'sell' },
};

const MARKET = {
  active: { label: 'Open', marker: 'square', tone: 'buy' },
  halted: { label: 'Halted', marker: 'pause', tone: 'wait' },
  delisted: { label: 'Delisted', marker: 'dash', tone: 'muted' },
};

const KYC = {
  none: { label: 'Not started', marker: 'tag', tone: 'neutral' },
  pending: { label: 'Pending review', marker: 'clock', tone: 'wait' },
  approved: { label: 'Approved', marker: 'tick', tone: 'buy' },
  rejected: { label: 'Rejected', marker: 'cross', tone: 'sell' },
};

const ACCOUNT = {
  active: { label: 'Active', marker: 'square', tone: 'buy' },
  frozen: { label: 'Frozen', marker: 'lock', tone: 'sell' },
};

const TRANSACTION = {
  pending: { label: 'Pending', marker: 'clock', tone: 'wait' },
  completed: { label: 'Completed', marker: 'square', tone: 'buy' },
  rejected: { label: 'Rejected', marker: 'cross', tone: 'sell' },
  cancelled: { label: 'Cancelled', marker: 'dash', tone: 'muted' },
};

const CANCEL_REASON = {
  user: 'You cancelled it',
  ioc_remainder: 'Market order: the unfilled rest was cancelled',
  self_trade: 'It would have traded with your own order',
  market_halted: 'The market was halted',
  account_frozen: 'The account was frozen',
};

const fallback = (value) => ({ label: String(value ?? '—'), marker: 'none', tone: 'neutral' });

export const orderStatus = (s) => ORDER[s] ?? fallback(s);
export const marketStatus = (s) => MARKET[s] ?? fallback(s);
export const accountStatus = (s) => ACCOUNT[s] ?? fallback(s);
export const transactionStatus = (s) => TRANSACTION[s] ?? fallback(s);
export const cancelReason = (r) => CANCEL_REASON[r] ?? r ?? '';

/** KYC status; a rejection carries its reason in the label. */
export function kycStatus(s, rejectReason) {
  const base = KYC[s] ?? fallback(s);
  return s === 'rejected' && rejectReason ? { ...base, label: `Rejected: ${rejectReason}` } : base;
}

/** The short KYC label for tables (Admin · Users): Pending rather than Pending review. */
export function kycShort(s) {
  const base = KYC[s] ?? fallback(s);
  return s === 'pending' ? { ...base, label: 'Pending' } : base;
}

export const sideLabel = (side) => (side === 'buy' ? 'Buy' : 'Sell');
export const sideTone = (side) => (side === 'buy' ? 'buy' : 'sell');
export const roleLabel = (role) => (role === 'admin' ? 'Admin' : 'User');
export const documentLabel = (type) => ({ passport: 'Passport', national_id: 'National ID', driving_licence: 'Driving licence' })[type] ?? type;

const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
/** A country code as its English name: IN -> India. */
export const countryName = (code) => {
  try {
    return regions?.of(code) ?? code;
  } catch {
    return code;
  }
};

/** The action names in audit logs, in words for the security activity table. */
export function activityLabel(action) {
  return {
    'auth.login': 'Logged in',
    'auth.login_failed': 'Wrong password',
    'auth.2fa_failed': 'Wrong two-factor code',
    'user.registered': 'Account created',
    'user.2fa_enabled': 'Two-factor turned on',
    'user.2fa_disabled': 'Two-factor turned off',
    'user.password_changed': 'Password changed',
    'user.email_verified': 'Email confirmed',
    'user.session_revoked': 'Signed out a device',
    'user.sessions_revoked': 'Signed out other devices',
  }[action] ?? action;
}

export const isWarningActivity = (action) => action === 'auth.login_failed' || action === 'auth.2fa_failed';
