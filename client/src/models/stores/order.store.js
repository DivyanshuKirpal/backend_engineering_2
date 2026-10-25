// The signed-in user's open orders: loaded from GET /orders?state=open and kept
// current by order.update events (section 6, flow A, step 7), reloaded after a
// reconnect. A placed order is added as soon as the API accepts it. Orders that
// finish (filled, cancelled, rejected) leave the list, and an update older
// than the one already held is ignored, since the socket can beat the 202.
// The list belongs to one user: it empties when they sign out or someone else
// signs in.

import { createStore } from './createStore.js';
import { session } from './session.store.js';
import * as orderApi from '../api/order.api.js';
import { socket } from '../realtime/socket.js';

const OPEN = new Set(['pending', 'open', 'partially_filled']);

export const openOrders = createStore({ status: 'idle', list: [], error: null });

// Last update time per order id, finished ones included, so a late copy can't
// bring an order back.
const seen = new Map();
let loading = null;

const newer = (order) => Date.parse(order.updatedAt) >= (seen.get(order.id) ?? -Infinity);

export function loadOpenOrders() {
  loading ??= (async () => {
    if (openOrders.get().status !== 'ready') openOrders.set({ status: 'loading', error: null });
    try {
      const list = [];
      let cursor;
      do {
        const page = await orderApi.list({ state: 'open', cursor, limit: 100 });
        list.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      for (const o of list) seen.set(o.id, Date.parse(o.updatedAt));
      openOrders.set({ status: 'ready', list, error: null });
    } catch (error) {
      openOrders.set({ status: 'error', error });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function clearOpenOrders() {
  seen.clear();
  openOrders.set({ status: 'idle', list: [], error: null });
}

/** Adds or updates one order (a 202 response or an order.update event). */
export function mergeOrder(order) {
  if (openOrders.get().status !== 'ready' || !newer(order)) return;
  seen.set(order.id, Date.parse(order.updatedAt));
  const list = openOrders.get().list;
  const at = list.findIndex((o) => o.id === order.id);
  let next = list;
  if (!OPEN.has(order.status)) next = list.filter((o) => o.id !== order.id);
  else if (at >= 0) next = list.map((o) => (o.id === order.id ? order : o));
  else next = [...list, order];
  if (next !== list) openOrders.set({ list: next });
}

export const isOpen = (order) => OPEN.has(order?.status);

let owner = session.get().user?.id ?? null;
session.subscribe(({ user }) => {
  if ((user?.id ?? null) === owner) return;
  owner = user?.id ?? null;
  clearOpenOrders();
});

socket.on('order.update', ({ order }) => mergeOrder(order));

socket.on('reconnect', () => {
  if (openOrders.get().status === 'ready') loadOpenOrders();
});
