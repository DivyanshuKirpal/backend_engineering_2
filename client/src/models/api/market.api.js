// Asset and market endpoints (section 4, Assets and markets).

import { get } from './http.js';

/** -> { assets: [Asset] } */
export const assets = () => get('/assets');
/** -> { asset, markets: [symbol] } */
export const asset = (code) => get(`/assets/${encodeURIComponent(code)}`);
/** -> { markets: [Market] } */
export const markets = () => get('/markets');
/** -> { market } */
export const market = (symbol) => get(`/markets/${encodeURIComponent(symbol)}`);
/** -> { seq, bids: [[price, qty]], asks: [[price, qty]] } */
export const orderbook = (symbol, depth = 50) => get(`/markets/${encodeURIComponent(symbol)}/orderbook`, { depth });
/** -> { trades: [PublicTrade] } */
export const trades = (symbol) => get(`/markets/${encodeURIComponent(symbol)}/trades`);
/** -> { candles: [Candle] } */
export const candles = (symbol, { interval = '1h', from, to, limit = 500 } = {}) => get(`/markets/${encodeURIComponent(symbol)}/candles`, { interval, from, to, limit });
