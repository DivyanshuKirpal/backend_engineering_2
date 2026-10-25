// Balances (section 1, balance.store): loaded from GET /wallet/balances, kept
// current by balance.update events, reloaded after a reconnect.

import { createStore } from './createStore.js';
import * as walletApi from '../api/wallet.api.js';
import { socket } from '../realtime/socket.js';

export const balances = createStore({ status: 'idle', list: [], error: null });

let loading = null;

export async function loadBalances() {
  loading ??= (async () => {
    if (balances.get().status !== 'ready') balances.set({ status: 'loading', error: null });
    try {
      const data = await walletApi.balances();
      balances.set({ status: 'ready', list: data.balances, error: null });
    } catch (error) {
      balances.set({ status: 'error', error });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function clearBalances() {
  balances.set({ status: 'idle', list: [], error: null });
}

/** Free amounts by asset, e.g. { USDT: "1616.000800" }. */
export function freeByAsset() {
  return Object.fromEntries(balances.get().list.map((b) => [b.asset, b.available]));
}

socket.on('balance.update', (b) => {
  if (balances.get().status !== 'ready') return;
  const list = balances.get().list;
  const next = list.some((x) => x.asset === b.asset) ? list.map((x) => (x.asset === b.asset ? b : x)) : [...list, b];
  balances.set({ list: next });
});

socket.on('reconnect', () => {
  if (balances.get().status === 'ready') loadBalances();
});
