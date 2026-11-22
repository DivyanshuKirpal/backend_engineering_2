// The in-process event bus, standing in for Redis Pub/Sub (section 3). The
// market simulator, the engine and the wallet publish events to named
// channels: `tickers`, `market:{symbol}`, `candles:{symbol}:{interval}` and
// `user:{userId}`. Anything that wants every event registers a tap; the
// Socket.IO gateway (view/sockets/gateway.js) is the one tap, and sends each
// event to the room of the same name. Delivery is at most once, as with the
// real relay: an event published while a client is disconnected is gone.

const taps = new Set();

export function publish(channel, event, payload) {
  for (const tap of taps) {
    try {
      tap(channel, event, payload);
    } catch (err) {
      console.error(`[bus] ${channel} ${event}`, err);
    }
  }
}

/** Calls fn(channel, event, payload) for every event; returns a function that stops it. */
export function tap(fn) {
  taps.add(fn);
  return () => taps.delete(fn);
}
