// useRecentTradesPresenter (section 5, RecentTrades): the tape, newest first,
// from GET /markets/:symbol/trades plus live trade events, reloaded after a
// reconnect. Each print is coloured by the taker's side and says it in words.

import * as money from '../../models/domain/money.js';
import * as marketApi from '../../models/api/market.api.js';
import { socket } from '../../models/realtime/socket.js';
import { price as fmtPrice, qty } from '../formatters/number.format.js';
import { clock } from '../formatters/date.format.js';

const KEEP = 50;

export function createRecentTradesPresenter(p, { symbol, market }) {
  let status = 'loading';
  let trades = [];
  let token = 0;

  async function load() {
    const mine = ++token;
    try {
      const data = await marketApi.trades(symbol);
      if (mine !== token || p.disposed) return;
      trades = data.trades.slice(0, KEEP);
      status = 'ready';
    } catch {
      if (mine !== token || p.disposed) return;
      status = trades.length ? 'ready' : 'error';
    }
    p.changed();
  }

  p.own(socket.subscribe(`market:${symbol}`));
  p.own(socket.on('trade', (t) => {
    if (t.symbol !== symbol || status !== 'ready' || trades.some((x) => x.id === t.id)) return;
    const { symbol: _s, ...trade } = t;
    trades = [trade, ...trades].slice(0, KEEP);
    p.changed();
  }));
  p.own(socket.on('reconnect', () => load()));
  load();

  return {
    /** Whether the last print was above the one before it (the ladder's Last ▲ or ▼). */
    lastUp() {
      const [a, b] = trades;
      if (!a || !b) return null;
      return money.eq(a.price, b.price) ? a.takerSide === 'buy' : money.gt(a.price, b.price);
    },
    vm() {
      const m = market();
      if (!m || status !== 'ready') return { status: status === 'ready' ? 'loading' : status };
      if (!trades.length) return { status: 'empty' };
      return {
        status: 'ready',
        rows: trades.map((t) => ({
          key: t.id,
          price: fmtPrice(t.price, m.tickSize),
          qty: qty(t.quantity, m.stepSize),
          time: clock(t.time),
          tone: t.takerSide === 'buy' ? 'buy' : 'sell',
          side: t.takerSide === 'buy' ? 'Buyer took' : 'Seller took',
        })),
      };
    },
    actions: { retry: load },
  };
}
