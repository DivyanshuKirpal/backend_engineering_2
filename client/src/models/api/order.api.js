// Order and my-trade endpoints (section 4, Orders and my trades).

import { ApiError, get, del, request, idempotencyKey } from './http.js';

/**
 * -> { order } with status pending (202). Sends an Idempotency-Key and, after a
 * network failure, retries once with the same key, so a retry can't place a
 * second order.
 */
export async function place({ market, side, type, price, quantity, quoteQuantity }) {
  const key = idempotencyKey();
  const send = () => request('POST', '/orders', {
    body: { market, side, type, price, quantity, quoteQuantity },
    headers: { 'Idempotency-Key': key },
  });
  try {
    return await send();
  } catch (err) {
    if (err instanceof ApiError && err.code === 'NETWORK') return send();
    throw err;
  }
}

/** -> { items: [Order], nextCursor } */
export const list = ({ state = 'open', market, side, cursor, limit } = {}) => get('/orders', { state, market, side, cursor, limit });
/** -> { order, fills: [MyTrade], ledger: [LedgerEntry] } */
export const one = (id) => get(`/orders/${encodeURIComponent(id)}`);
/** -> { orderId, cancelRequested: true } (202) */
export const cancel = (id) => del(`/orders/${encodeURIComponent(id)}`);
/** -> { cancelRequested } (202) */
export const cancelAll = ({ market } = {}) => del('/orders', { market });
/** -> { items: [MyTrade], nextCursor } */
export const myTrades = ({ market, side, cursor, limit } = {}) => get('/trades', { market, side, cursor, limit });
