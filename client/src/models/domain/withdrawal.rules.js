// Withdrawal rules (section 6, flow D, and section 7): the amount includes the
// fee, must reach the asset's minimum, sit above the fee, fit its decimals and
// the free balance; the address must be a simulated one for that asset.

import * as money from './money.js';

/** `sim-`, the asset code in lower case, a hyphen and 16 hex characters. */
export function addressPattern(asset) {
  return new RegExp(`^sim-${asset.toLowerCase()}-[0-9a-f]{16}$`);
}

export const isAddressFor = (asset, address) => addressPattern(asset).test(String(address ?? '').trim());

/** What leaves the wallet, the fee and what the recipient gets. */
export function summary(asset, amount) {
  if (!money.isDecimal(amount ?? '') || !money.isPositive(amount)) return null;
  const receive = money.sub(amount, asset.withdrawFee);
  return { leaves: amount, fee: asset.withdrawFee, receive: money.isNegative(receive) ? '0' : receive };
}

/**
 * `{ ok, errors }` with errors keyed by field (address, amount, code), each
 * `{ code, ...values }`. `user` carries kycStatus and twoFactorEnabled.
 */
export function validate(asset, { address, amount, code }, free, user) {
  const errors = {};
  if (user.kycStatus !== 'approved') errors.form = { code: 'kyc' };
  if (!asset.withdrawEnabled) errors.form = { code: 'disabled' };

  if (!String(address ?? '').trim()) errors.address = { code: 'required' };
  else if (!isAddressFor(asset.code, address)) errors.address = { code: 'format', asset: asset.code };

  if (!money.isDecimal(amount ?? '') || !money.isPositive(amount)) errors.amount = { code: 'required' };
  else if (!money.fitsDecimals(amount, asset.decimals)) errors.amount = { code: 'decimals', decimals: asset.decimals };
  else if (money.lt(amount, asset.minWithdraw)) errors.amount = { code: 'min', min: asset.minWithdraw };
  else if (money.lte(amount, asset.withdrawFee)) errors.amount = { code: 'fee', fee: asset.withdrawFee };
  else if (money.gt(amount, free ?? '0')) errors.amount = { code: 'balance', free: free ?? '0' };

  if (user.twoFactorEnabled && !/^\d{6}$/.test(String(code ?? ''))) errors.code = { code: 'required' };
  return { ok: Object.keys(errors).length === 0, errors };
}
