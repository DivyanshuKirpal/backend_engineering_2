// Stands in for Redis Pub/Sub (section 3): the market simulator and the engine
// publish events to named channels, and the fake socket gateway relays them.
// Channels: `tickers`, `market:{symbol}`, `candles:{symbol}:{interval}`,
// `user:{userId}`. Delivery is at most once, as with the real relay.

const channels = new Map();

export function publish(channel, event, payload) {
  const listeners = channels.get(channel);
  if (!listeners) return;
  for (const listener of [...listeners]) {
    try {
      listener(event, payload, channel);
    } catch (err) {
      console.error(`[bus] ${channel} ${event}`, err);
    }
  }
}

export function listen(channel, listener) {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(listener);
  return () => {
    channels.get(channel)?.delete(listener);
    if (channels.get(channel)?.size === 0) channels.delete(channel);
  };
}
