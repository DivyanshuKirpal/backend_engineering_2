// Assets from GET /assets: names, decimals, fees, minimums and deposit limits.
// They change only when an admin edits them, so one load per page visit does.

import { createStore } from './createStore.js';
import * as marketApi from '../api/market.api.js';

export const assets = createStore({ status: 'idle', list: [], error: null });

let loading = null;

export function loadAssets() {
  if (assets.get().status === 'ready') return Promise.resolve();
  loading ??= (async () => {
    assets.set({ status: 'loading', error: null });
    try {
      const data = await marketApi.assets();
      assets.set({ status: 'ready', list: data.assets, error: null });
    } catch (error) {
      assets.set({ status: 'error', error });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export const assetByCode = (code) => assets.get().list.find((a) => a.code === code) ?? null;
