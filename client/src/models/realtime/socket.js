// The client's one socket (section 1, socketClient): an EventTarget that joins
// rooms and re-dispatches server events: ticker, orderbook, trade, candle,
// market.status, order.update, balance.update, notification and engine.status.
// It also dispatches `status` (connecting, connected, reconnecting) and
// `reconnect`, after which presenters reload their data instead of trusting
// the event stream (section 4: delivery is at most once).
//
// Static phase: it connects to the mock gateway. With the server it wraps a
// Socket.IO client (WebSocket only); its interface stays the same.

import { connect as mockConnect } from '../api/mock/server.js';

class Socket extends EventTarget {
  #connection = null;
  #rooms = new Map(); // room -> subscriber count
  #token = null;
  #attempt = 0;
  status = 'connecting';

  #setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.dispatchEvent(new CustomEvent('status', { detail: status }));
  }

  async #open() {
    const attempt = ++this.#attempt;
    const connection = await mockConnect({
      token: this.#token,
      onEvent: (event, payload) => {
        if (this.status === 'connected') this.dispatchEvent(new CustomEvent(event, { detail: payload }));
      },
    });
    if (attempt !== this.#attempt) {
      connection.close();
      return;
    }
    this.#connection = connection;
    for (const room of this.#rooms.keys()) connection.join(room);
    this.#setStatus('connected');
  }

  /** Connects, or reconnects with a new access token after login or refresh. */
  async connect(token = this.#token) {
    this.#token = token;
    this.#connection?.close();
    this.#connection = null;
    await this.#open();
  }

  /** Joins a public room: tickers, market:{symbol} or candles:{symbol}:{interval}. */
  subscribe(room) {
    this.#rooms.set(room, (this.#rooms.get(room) ?? 0) + 1);
    if (this.#rooms.get(room) === 1) this.#connection?.join(room);
    return () => this.unsubscribe(room);
  }

  unsubscribe(room) {
    const n = (this.#rooms.get(room) ?? 0) - 1;
    if (n > 0) {
      this.#rooms.set(room, n);
      return;
    }
    this.#rooms.delete(room);
    this.#connection?.leave(room);
  }

  /** Listens for one event; returns a function that stops listening. */
  on(event, handler) {
    const listener = (e) => handler(e.detail);
    this.addEventListener(event, listener);
    return () => this.removeEventListener(event, listener);
  }

  /** Demo control: drops the connection for `ms`, then reconnects. */
  simulateDrop(ms = 4000) {
    if (this.status !== 'connected') return;
    this.#connection?.close();
    this.#connection = null;
    this.#setStatus('reconnecting');
    setTimeout(async () => {
      await this.#open();
      this.dispatchEvent(new CustomEvent('reconnect'));
    }, ms);
  }
}

export const socket = new Socket();
