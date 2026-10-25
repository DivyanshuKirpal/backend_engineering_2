// The market the header's Trade link opens: the last one traded on this
// browser, BTC-USDT at first.

import { createStore } from '../../models/stores/createStore.js';

const KEY = 'orichal.lastMarket';
const read = () => {
  try {
    return localStorage.getItem(KEY) || 'BTC-USDT';
  } catch {
    return 'BTC-USDT';
  }
};

export const lastMarket = createStore({ symbol: read() });

export function rememberMarket(symbol) {
  if (lastMarket.get().symbol === symbol) return;
  lastMarket.set({ symbol });
  try {
    localStorage.setItem(KEY, symbol);
  } catch {
    // ignore
  }
}
