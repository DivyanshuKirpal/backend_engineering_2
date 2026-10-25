// Asset and market routes (section 4, market.routes.js), served from the
// market simulator's live state.

import { db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import * as market from '../market.js';

export function marketDto(config) {
  return {
    symbol: config.symbol, baseAsset: config.baseAsset, quoteAsset: config.quoteAsset, status: config.status,
    tickSize: config.tickSize, stepSize: config.stepSize, minQty: config.minQty, minNotional: config.minNotional,
    makerFeeRate: config.makerFeeRate, takerFeeRate: config.takerFeeRate,
    ticker: market.ticker(config.symbol),
  };
}

const listed = (symbol) => {
  const config = db().markets.find((m) => m.symbol === symbol && m.status !== 'delisted');
  if (!config) throw notFound('That market doesn\'t exist.');
  return config;
};

export default [
  ['GET', '/assets', () => ({ data: { assets: db().assets.filter((a) => a.status === 'active').map((a) => ({ ...a })) } })],

  ['GET', '/assets/:code', (ctx) => {
    const asset = db().assets.find((a) => a.code === String(ctx.params.code).toUpperCase() && a.status === 'active');
    if (!asset) throw notFound('That asset doesn\'t exist.');
    const markets = db().markets.filter((m) => m.status !== 'delisted' && (m.baseAsset === asset.code || m.quoteAsset === asset.code)).map((m) => m.symbol);
    return { data: { asset: { ...asset }, markets } };
  }],

  ['GET', '/markets', () => ({ data: { markets: db().markets.filter((m) => m.status !== 'delisted').map(marketDto) } })],

  ['GET', '/markets/:symbol', (ctx) => ({ data: { market: marketDto(listed(ctx.params.symbol)) } })],

  ['GET', '/markets/:symbol/orderbook', (ctx) => {
    listed(ctx.params.symbol);
    const depth = Math.min(100, Math.max(1, Number(ctx.query.depth) || 50));
    return { data: market.snapshot(ctx.params.symbol, depth) };
  }],

  ['GET', '/markets/:symbol/trades', (ctx) => {
    listed(ctx.params.symbol);
    return { data: { trades: market.trades(ctx.params.symbol, 50) } };
  }],

  ['GET', '/markets/:symbol/candles', (ctx) => {
    listed(ctx.params.symbol);
    const interval = ctx.query.interval ?? '1h';
    const limit = Math.min(500, Math.max(1, Number(ctx.query.limit) || 500));
    const candles = market.candles(ctx.params.symbol, interval, limit);
    if (!candles) throw badRequest('Unknown interval.', { interval: 'value' });
    return { data: { candles } };
  }],
];
