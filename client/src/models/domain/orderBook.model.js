// The live order book on the client (section 6, flow C): deltas that arrive
// before the snapshot are buffered; deltas at or below the snapshot's seq are
// dropped; each later delta must carry the previous seq + 1, or the book asks
// for a resync. Quantity "0" removes a level. Prices and sizes stay strings.

import * as money from './money.js';

export function createBook() {
  return { seq: null, bids: new Map(), asks: new Map(), buffer: [] };
}

/** Holds a delta that arrived before the snapshot. */
export function buffer(book, delta) {
  book.buffer.push(delta);
}

/** Loads a snapshot and replays buffered deltas. Returns 'ok' or 'gap'. */
export function load(book, snapshot) {
  book.seq = snapshot.seq;
  book.bids = new Map(snapshot.bids.map(([p, q]) => [p, q]));
  book.asks = new Map(snapshot.asks.map(([p, q]) => [p, q]));
  const pending = book.buffer.filter((d) => d.seq > snapshot.seq).sort((a, b) => a.seq - b.seq);
  book.buffer = [];
  for (const d of pending) {
    if (apply(book, d) === 'gap') return 'gap';
  }
  return 'ok';
}

/** Applies one delta. Returns 'ok', 'stale' (already included) or 'gap'. */
export function apply(book, delta) {
  if (book.seq == null) {
    buffer(book, delta);
    return 'ok';
  }
  if (delta.seq <= book.seq) return 'stale';
  if (delta.seq !== book.seq + 1) return 'gap';
  for (const [side, list] of [['bids', delta.bids], ['asks', delta.asks]]) {
    for (const [p, q] of list) {
      if (money.isZero(q)) book[side].delete(p);
      else book[side].set(p, q);
    }
  }
  book.seq = delta.seq;
  return 'ok';
}

/** Levels best first: bids high to low, asks low to high. */
export function side(book, which, depth = Infinity) {
  const list = [...book[which].entries()].sort((a, b) => (which === 'bids' ? money.cmp(b[0], a[0]) : money.cmp(a[0], b[0])));
  return list.slice(0, depth);
}

/**
 * Groups levels by a price step: bids round down, asks round up, so a group
 * never shows a better price than its orders. Quantities add up.
 */
export function group(levels, step, which) {
  const out = new Map();
  for (const [p, q] of levels) {
    const key = money.roundToStep(p, step, which === 'bids' ? 'floor' : 'ceil');
    out.set(key, out.has(key) ? money.add(out.get(key), q) : q);
  }
  return [...out.entries()].sort((a, b) => (which === 'bids' ? money.cmp(b[0], a[0]) : money.cmp(a[0], b[0])));
}

export function best(book) {
  return { bid: side(book, 'bids', 1)[0] ?? null, ask: side(book, 'asks', 1)[0] ?? null };
}
