// Merges live candle updates into a loaded series (section 1): an update for
// the last candle replaces it, a newer one is appended, an older one ignored.

export function merge(series, candle) {
  if (!series.length) return [candle];
  const last = series[series.length - 1];
  if (candle.time === last.time) return [...series.slice(0, -1), candle];
  if (candle.time > last.time) return [...series, candle];
  return series;
}
