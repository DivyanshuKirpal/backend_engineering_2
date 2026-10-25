// Markets with their latest tickers (section 1, ticker.store): loaded from
// GET /markets, then fed by ticker and market.status events.

import { createStore } from './createStore.js';
import * as marketApi from '../api/market.api.js';
import { socket } from '../realtime/socket.js';

export const tickers = createStore({ status: 'idle', markets: [], error: null });

let loading = null;
let live = false;

function goLive(markets) {
  if (live) return;
  live = true;
  socket.subscribe('tickers');
  // Status changes (halt, resume) arrive on each market's own room.
  for (const m of markets) socket.subscribe(`market:${m.symbol}`);
}

export async function loadMarkets() {
  loading ??= (async () => {
    if (tickers.get().status !== 'ready') tickers.set({ status: 'loading', error: null });
    try {
      const data = await marketApi.markets();
      tickers.set({ status: 'ready', markets: data.markets, error: null });
      goLive(data.markets);
    } catch (error) {
      tickers.set({ status: 'error', error });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export const marketBySymbol = (symbol) => tickers.get().markets.find((m) => m.symbol === symbol) ?? null;

/** Last prices by symbol, e.g. { "BTC-USDT": "62140.50" }. */
export function lastPrices() {
  return Object.fromEntries(tickers.get().markets.map((m) => [m.symbol, m.ticker.last]));
}

socket.on('ticker', (t) => {
  const { symbol, ...ticker } = t;
  const list = tickers.get().markets;
  if (!list.some((m) => m.symbol === symbol)) return;
  tickers.set({ markets: list.map((m) => (m.symbol === symbol ? { ...m, ticker } : m)) });
});

socket.on('market.status', ({ symbol, status }) => {
  tickers.set({ markets: tickers.get().markets.map((m) => (m.symbol === symbol ? { ...m, status } : m)) });
});

socket.on('reconnect', () => {
  if (tickers.get().status === 'ready') loadMarkets();
});
