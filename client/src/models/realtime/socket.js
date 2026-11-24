// The client's one socket (section 1, socketClient): an EventTarget that joins
// rooms and re-dispatches server events: ticker, orderbook, trade, candle,
// market.status, order.update, balance.update, notification and engine.status.
// It also dispatches `status` (connecting, connected, reconnecting) and
// `reconnect`, after which presenters reload their data instead of trusting
// the event stream (section 4: delivery is at most once).
//
// It wraps a Socket.IO client (the vendored ES module build) on the page's own
// origin, WebSocket only. Rooms don't survive a reconnection, so it joins its
// rooms again on every connect. The handshake carries the access token, which
// puts the socket in the user's private room; after a refresh replaces the
// token, it reconnects with the new one.

import { io } from '/assets/vendor/socket.io.esm.min.js';
import { onAccessTokenRefreshed, refreshToken } from '../api/http.js';

class Socket extends EventTarget {
  #socket = null;
  #rooms = new Map(); // room -> subscriber count
  #token = null;
  #lost = false; // dropped without being asked to: dispatch `reconnect` once it is back
  status = 'connecting';

  #setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.dispatchEvent(new CustomEvent('status', { detail: status }));
  }

  #open() {
    const socket = io({
      transports: ['websocket'],
      // Read again on every connect and reconnect, so a new token is used at once.
      auth: (send) => send({ token: this.#token }),
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
    socket.on('connect', () => {
      for (const room of this.#rooms.keys()) socket.emit('subscribe', { channel: room });
      this.#setStatus('connected');
      if (this.#lost) {
        this.#lost = false;
        this.dispatchEvent(new CustomEvent('reconnect'));
      }
    });
    socket.on('disconnect', (reason) => {
      // 'io client disconnect' is this code's own doing: a new token or a simulated drop.
      if (reason === 'io client disconnect') return;
      this.#lost = true;
      this.#setStatus('reconnecting');
    });
    // The access token is about to expire, and the private room with it: get a new one
    socket.on('token.expiring', () => refreshToken().catch(() => {}));
    socket.onAny((event, payload) => {
      if (this.status === 'connected') this.dispatchEvent(new CustomEvent(event, { detail: payload }));
    });
    this.#socket = socket;
  }

  /**
   * Connects, or reconnects with a new access token after login, refresh or
   * logout. `reload` also dispatches `reconnect` once it is back, for what was
   * missed in between.
   */
  connect(token = this.#token, { reload = false } = {}) {
    this.#token = token;
    if (reload) this.#lost = true;
    if (!this.#socket) {
      this.#open();
      return;
    }
    // The token travels in the handshake, so a new token needs a new connection.
    this.#socket.disconnect();
    this.#socket.connect();
  }

  /** Joins a public room: tickers, market:{symbol} or candles:{symbol}:{interval}. */
  subscribe(room) {
    this.#rooms.set(room, (this.#rooms.get(room) ?? 0) + 1);
    if (this.#rooms.get(room) === 1 && this.#socket?.connected) this.#socket.emit('subscribe', { channel: room });
    return () => this.unsubscribe(room);
  }

  unsubscribe(room) {
    const n = (this.#rooms.get(room) ?? 0) - 1;
    if (n > 0) {
      this.#rooms.set(room, n);
      return;
    }
    this.#rooms.delete(room);
    if (this.#socket?.connected) this.#socket.emit('unsubscribe', { channel: room });
  }

  /** Listens for one event; returns a function that stops listening. */
  on(event, handler) {
    const listener = (e) => handler(e.detail);
    this.addEventListener(event, listener);
    return () => this.removeEventListener(event, listener);
  }

  /** Demo control: drops the connection for `ms`, then reconnects. */
  simulateDrop(ms = 4000) {
    if (this.status !== 'connected' || !this.#socket) return;
    this.#lost = true;
    this.#socket.disconnect();
    this.#setStatus('reconnecting');
    setTimeout(() => this.#socket.connect(), ms);
  }
}

export const socket = new Socket();

// The access token was refreshed (http.js), after a 401 or because it was about
// to expire; the socket follows, so the server puts it in the user's room again.
onAccessTokenRefreshed((token) => socket.connect(token, { reload: true }));
