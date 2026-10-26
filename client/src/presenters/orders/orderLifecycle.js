// An order's lifecycle and ledger lines (section 7, Order lifecycle and Order
// ledger), shared by the trade page's Your orders and the order drawer. The
// trade page tells it in full ("The API accepted it (202) and locked…"); the
// drawer, as drawn, in short ("Accepted by the API, … locked.").

import * as money from '../../models/domain/money.js';
import * as rules from '../../models/domain/order.rules.js';
import { marketBySymbol } from '../../models/stores/ticker.store.js';
import { assetByCode } from '../../models/stores/asset.store.js';
import { fixed, plain, price as fmtPrice, qty, signed } from '../formatters/number.format.js';
import { precise } from '../formatters/date.format.js';
import { cancelReason } from '../formatters/status.format.js';

export const decimalsOf = (asset) => assetByCode(asset)?.decimals ?? 8;
export const remaining = (o) => money.sub(o.quantity ?? '0', o.filledQuantity ?? '0');

/** An amount in the order's own terms: the base at the step (0.02500 BTC), the quote at the tick when it fits. */
export function inOrderTerms(m, asset, value) {
  if (asset === m.baseAsset) return `${qty(value, m.stepSize)} ${asset}`;
  const dp = money.decimalsOf(m.tickSize);
  return `${money.eq(money.round(value, dp), value) ? fixed(value, dp) : plain(value)} ${asset}`;
}

const COPY = {
  full: {
    placed: (lock) => `The API accepted it (202) and locked ${lock}.`,
    pending: 'It goes on the book, or fills, in a moment.',
    pendingTitle: 'Waiting for the engine.',
    marketApplied: 'The engine ran it against the book straight away.',
    takenOnArrival: 'It crossed the book, so it never rested.',
    partOnArrival: (at) => `The engine matched part of it on arrival and queued the rest at ${at}.`,
    queued: (at) => `The engine queued it at ${at}.`,
    fill: (amount, at, role) => `${amount} at ${at}. You were the ${role}.`,
    waiting: (left, at) => `${left} left at ${at}.`,
  },
  short: {
    placed: (lock) => `Accepted by the API, ${lock} locked.`,
    pending: 'The engine hasn\'t queued it yet.',
    pendingTitle: 'Pending.',
    marketApplied: 'Matched against the book at once.',
    takenOnArrival: 'Filled on arrival; it never rested.',
    partOnArrival: (at) => `Part matched on arrival, the rest queued at ${at}.`,
    queued: (at) => `Queued at ${at}.`,
    fill: (amount, at) => `${amount} at ${at}.`,
    waiting: (left) => `${left} left.`,
  },
};

/** The steps: [{ key, time, title, body, state: 'done' | 'part' | 'now' | 'stopped' }]. */
export function lifecycle(o, fills, ledger, { short = false } = {}) {
  const m = marketBySymbol(o.market);
  if (!m) return [];
  const words = short ? COPY.short : COPY.full;
  const base = m.baseAsset;
  const at = (v) => fmtPrice(v, m.tickSize);
  const items = [];

  const lockEntry = ledger.find((e) => e.type === 'order_lock');
  const lock = lockEntry ? { asset: lockEntry.asset, amount: lockEntry.deltaLocked } : rules.lockFor(m, o);
  items.push({ key: 'placed', time: precise(o.createdAt), title: 'Placed.', state: 'done', body: words.placed(inOrderTerms(m, lock.asset, lock.amount)) });

  if (o.status === 'rejected') {
    items.push({ key: 'rejected', time: precise(o.updatedAt), title: 'Rejected.', state: 'stopped', body: `${o.rejectReason ?? 'The engine turned it down'}. The lock went back to free.` });
    return items;
  }
  if (!o.appliedAt) {
    items.push({ key: 'now', time: 'now', title: words.pendingTitle, state: 'now', body: words.pending });
    return items;
  }

  const taken = fills.filter((f) => f.role === 'taker');
  if (o.type === 'market') {
    items.push({ key: 'applied', time: precise(o.appliedAt), title: 'Matched.', state: 'done', body: words.marketApplied });
  } else if (taken.length && o.status === 'filled' && taken.length === fills.length) {
    items.push({ key: 'applied', time: precise(o.appliedAt), title: 'Matched on arrival.', state: 'done', body: words.takenOnArrival });
  } else if (taken.length) {
    items.push({ key: 'applied', time: precise(o.appliedAt), title: 'On the book.', state: 'done', body: words.partOnArrival(at(o.price)) });
  } else {
    items.push({ key: 'applied', time: precise(o.appliedAt), title: 'On the book.', state: 'done', body: words.queued(at(o.price)) });
  }

  fills.forEach((f, i) => {
    const complete = o.status === 'filled' && i === fills.length - 1;
    items.push({
      key: f.id,
      time: precise(f.time),
      title: complete ? 'Filled.' : 'Partly filled.',
      state: complete ? 'done' : 'part',
      body: words.fill(`${qty(f.quantity, m.stepSize)} ${base}`, at(f.price), f.role),
    });
  });

  if (o.status === 'open' || o.status === 'partially_filled') {
    items.push({ key: 'now', time: 'now', title: 'Waiting.', state: 'now', body: words.waiting(`${qty(remaining(o), m.stepSize)} ${base}`, at(o.price)) });
  } else if (o.status === 'cancelled') {
    const unlock = ledger.filter((e) => e.type === 'order_unlock').at(-1);
    const back = unlock ? ` ${inOrderTerms(m, unlock.asset, unlock.deltaAvailable)} went back to free.` : '';
    items.push({ key: 'cancelled', time: precise(o.updatedAt), title: 'Cancelled.', state: 'stopped', body: `${cancelReason(o.cancelReason)}.${back}` });
  }
  return items;
}

/** Ledger rows for LedgerTable. `zero` is what a zero change shows ("0" on Trade, "—" in the drawer). */
export function ledgerRows(ledger, { zero = '0' } = {}) {
  return ledger.map((e) => ({
    key: e.id,
    type: e.type,
    asset: e.asset,
    available: signed(e.deltaAvailable, decimalsOf(e.asset), { zero }),
    locked: signed(e.deltaLocked, decimalsOf(e.asset), { zero }),
  }));
}
