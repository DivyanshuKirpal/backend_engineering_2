// The price ladder's rows (section 7, Patterns: Price ladder), shared by the
// Home hero and the trade page. Asks above in red, bids below in green, size
// bars growing outward and sized against each side's largest level in view,
// your own resting amount tagged on its row ("1st in queue" only when the
// whole level is yours), and the last price with the spread between.

import * as money from '../../models/domain/money.js';
import { price as fmtPrice, qty as fmtQty } from '../formatters/number.format.js';

/**
 * asks, bids: [[price, qty]] best first. mine: [{ side, price, quantity }].
 * `priceStep` is the grouping the levels are shown at (the tick when not
 * grouped); the last price and the spread always use the tick, and `best`
 * gives the ungrouped best prices for the spread.
 * Returns { asks (top to bottom: farthest first), bids, middle }.
 */
export function ladder({
  asks, bids, tickSize, stepSize, priceStep = tickSize, best = null, depth = 5, mine = [], last = null, lastUp = true, showTicks = false,
}) {
  const shownAsks = asks.slice(0, depth);
  const shownBids = bids.slice(0, depth);
  // Bars share one scale: the largest level in view on either side is full width.
  const largest = [...shownAsks, ...shownBids].reduce((m, [, q]) => money.max(m, q), '0');

  const row = (side, [p, q]) => {
    const own = mine.filter((o) => (side === 'ask' ? o.side === 'sell' : o.side === 'buy') && money.eq(o.price, p));
    const ownQty = own.reduce((s, o) => money.add(s, o.quantity), '0');
    const whole = own.length > 0 && money.eq(ownQty, q);
    return {
      key: `${side}-${p}`,
      side,
      pick: p,
      price: fmtPrice(p, priceStep),
      size: fmtQty(q, stepSize),
      bar: money.isZero(largest) ? 0 : Number(money.pct(q, largest, 1)),
      mine: own.length ? (whole ? 'You · 1st in queue' : `You ${fmtQty(ownQty, stepSize)}`) : null,
    };
  };

  const bestAsk = best ? best.ask : asks[0]?.[0];
  const bestBid = best ? best.bid : bids[0]?.[0];
  let spread = null;
  if (bestAsk && bestBid) {
    const gap = money.sub(bestAsk, bestBid);
    const ticks = money.div(gap, tickSize, 0);
    spread = { value: fmtPrice(gap, tickSize), ticks: showTicks ? `${ticks} ticks` : null };
  }

  return {
    asks: shownAsks.map((l) => row('ask', l)).reverse(),
    bids: shownBids.map((l) => row('bid', l)),
    middle: {
      last: last ? fmtPrice(last, tickSize) : '—',
      arrow: lastUp ? '▲' : '▼',
      direction: lastUp ? 'up' : 'down',
      spread,
    },
  };
}
