// useOrderBookPresenter (section 6, flow C): the live book, grouped by the
// picked price step, as price-ladder rows with your own resting amounts
// tagged. A price click goes to the order ticket through `onPick`.

import * as money from '../../models/domain/money.js';
import * as bookModel from '../../models/domain/orderBook.model.js';
import { createLiveBook } from '../shared/liveBook.js';
import { ladder } from './ladder.js';
import { plain, pair } from '../formatters/number.format.js';

// Each half of the ladder shows up to this many levels; the view clips what doesn't fit.
const DEPTH = 15;

/**
 * market(): the market config. mine(): your open orders on this market.
 * lastUp(): whether the last trade went up. onPick(price): fills the ticket.
 */
export function createOrderBookPresenter(p, { symbol, market, mine, lastUp, onPick }) {
  const book = createLiveBook(symbol, () => p.changed(), { depth: 50 });
  p.own(book.dispose);
  let group = null;

  const groups = (m) => [1, 10, 100, 1000, 10000].map((k) => money.mul(m.tickSize, String(k))).map((v) => money.normalize(v));

  return {
    /** The whole book, best first, for "what the engine will do". */
    levels: () => (book.status === 'ready' ? { bids: book.side('bids'), asks: book.side('asks') } : { bids: [], asks: [] }),
    vm() {
      const m = market();
      if (!m) return { status: 'loading' };
      const step = group ?? money.normalize(m.tickSize);
      const options = groups(m).map((v) => ({ value: v, label: plain(v) }));
      if (book.status !== 'ready') return { status: book.status, groups: options, group: step, error: book.status === 'error' ? 'The order book didn\'t load.' : null };

      const grouped = !money.eq(step, m.tickSize);
      const asks = grouped ? bookModel.group(book.side('asks'), step, 'asks') : book.side('asks');
      const bids = grouped ? bookModel.group(book.side('bids'), step, 'bids') : book.side('bids');
      if (!asks.length && !bids.length) {
        return {
          status: 'empty',
          groups: options,
          group: step,
          empty: m.status === 'halted' ? `${pair(symbol)} is halted, so the book is empty.` : 'No orders on the book yet.',
        };
      }
      // Your orders count toward the group their price falls in, like everyone else's.
      const own = mine()
        .filter((o) => o.status === 'open' || o.status === 'partially_filled')
        .map((o) => ({
          side: o.side,
          price: grouped ? money.roundToStep(o.price, step, o.side === 'buy' ? 'floor' : 'ceil') : o.price,
          quantity: money.sub(o.quantity, o.filledQuantity),
        }));
      return {
        status: 'ready',
        groups: options,
        group: step,
        caption: `${pair(symbol)} order book: asks above, bids below`,
        ...ladder({
          asks, bids, tickSize: m.tickSize, priceStep: step, stepSize: m.stepSize, depth: DEPTH,
          best: { ask: book.best().ask?.[0], bid: book.best().bid?.[0] },
          mine: own, last: m.ticker.last, lastUp: lastUp(), showTicks: true,
        }),
      };
    },
    actions: {
      setGroup(value) {
        group = value;
        p.changed();
      },
      pick(price) {
        onPick?.(price);
      },
      retry: () => book.retry(),
    },
  };
}
