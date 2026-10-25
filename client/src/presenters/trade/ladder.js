// The price ladder's rows (section 7, Patterns: Price ladder), shared by the
// Home hero and the trade page. Asks above in red, bids below in green, size
// bars growing outward and sized against each side's largest level in view,
// your own resting amount tagged on its row ("1st in queue" only when the
// whole level is yours), and the last price with the spread between.

import * as money from '../../models/domain/money.js';
import { price as fmtPrice, qty as fmtQty } from '../formatters/number.format.js';

/**
 * asks, bids: [[price, qty]] best first. mine: [{ side, price, quantity }].
 * Returns { asks (top to bottom: farthest first), bids, middle }.
 */
export function ladder({ asks, bids, tickSize, stepSize, depth = 5, mine = [], last = null, lastUp = true, showTicks = false }) {
  const shownAsks = asks.slice(0, depth);
  const shownBids = bids.slice(0, depth);
  // Bars share one scale: the largest level in view on either side is full width.
  const largest = [...shownAsks, ...shownBids].reduce((m, [, q]) => money.max(m, q), '0');
  const maxAsk = largest;
  const maxBid = largest;

  const row = (side, [p, q], max) => {
    const own = mine.filter((o) => (side === 'ask' ? o.side === 'sell' : o.side === 'buy') && money.eq(o.price, p));
    const ownQty = own.reduce((s, o) => money.add(s, o.quantity), '0');
    const whole = own.length > 0 && money.eq(ownQty, q);
    return {
      key: `${side}-${p}`,
      side,
      pick: p,
      price: fmtPrice(p, tickSize),
      size: fmtQty(q, stepSize),
      bar: money.isZero(max) ? 0 : Number(money.pct(q, max, 1)),
      mine: own.length ? (whole ? 'You · 1st in queue' : `You ${fmtQty(ownQty, stepSize)}`) : null,
    };
  };

  const bestAsk = asks[0]?.[0];
  const bestBid = bids[0]?.[0];
  let spread = null;
  if (bestAsk && bestBid) {
    const gap = money.sub(bestAsk, bestBid);
    const ticks = money.div(gap, tickSize, 0);
    spread = { value: fmtPrice(gap, tickSize), ticks: showTicks ? `${ticks} ticks` : null };
  }

  return {
    asks: shownAsks.map((l) => row('ask', l, maxAsk)).reverse(),
    bids: shownBids.map((l) => row('bid', l, maxBid)),
    middle: {
      last: last ? fmtPrice(last, tickSize) : '—',
      arrow: lastUp ? '▲' : '▼',
      direction: lastUp ? 'up' : 'down',
      spread,
    },
  };
}
