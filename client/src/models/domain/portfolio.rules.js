// Portfolio rules (section 6): balances valued at live prices, allocation
// shares, and small balances, which are worth under 1 USDT (section 7).

import * as money from './money.js';

export const SMALL_BALANCE_USDT = '1';
/** The allocation bar keeps this order so neighbours never change (section 7). */
export const ASSET_ORDER = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB'];

/** The USDT value of `amount` of `asset`, from each market's last price. */
export function valueOf(asset, amount, lastPrices) {
  if (asset === 'USDT') return amount;
  const last = lastPrices[`${asset}-USDT`];
  return last ? money.mul(amount, last) : '0';
}

/**
 * Values every balance and sums them. Returns rows in ASSET_ORDER with
 * `value` and `share` (percent of the total), plus the totals.
 */
export function valuePortfolio(balances, lastPrices) {
  const rows = [...balances]
    .sort((a, b) => ASSET_ORDER.indexOf(a.asset) - ASSET_ORDER.indexOf(b.asset))
    .map((b) => ({
      ...b,
      value: valueOf(b.asset, b.total, lastPrices),
      freeValue: valueOf(b.asset, b.available, lastPrices),
      heldValue: valueOf(b.asset, b.locked, lastPrices),
    }));
  const total = money.sum(rows.map((r) => r.value));
  const free = money.sum(rows.map((r) => r.freeValue));
  const held = money.sum(rows.map((r) => r.heldValue));
  for (const r of rows) r.share = money.isZero(total) ? '0' : money.pct(r.value, total, 4);
  return { rows, total, free, held };
}

export const isSmall = (value) => money.lt(value, SMALL_BALANCE_USDT);
