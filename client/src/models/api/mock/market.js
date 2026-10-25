// The market simulator: what the engine process, the market-maker bot and the
// ticker and candle workers do on the server (sections 1 and 6), in miniature.
//
// Each market's book has two parts. The anonymous ladder is the bot and the
// rest of the world, started from the board's snapshot; it re-quotes on a slow,
// mean-reverting random walk. People's resting orders (from the database) sit
// on top at their own prices, queued behind whatever was already at that price.
// A bot taker trades at the touch every few seconds, so resting orders fill as
// makers. Prices are held in integer ticks and sizes in integer steps, and
// converted back to decimal strings with money.js, so no float touches them.
//
// Events go out on the bus as section 4 names them: ticker, orderbook (changed
// levels with a seq), trade, candle and market.status, plus engine.status.

import * as money from '../../domain/money.js';
import { db, fetchSeed, newId } from './db.js';
import { publish } from './bus.js';

export const INTERVALS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const HISTORY = 240;
const BOT_TAKER = '66e1b0a7c3f9d2e5481b7c02';
const LEADER_ID = 'engine-7f2c';

const markets = new Map();
let makerFillHook = null;
let timers = [];
let started = false;

// ---------------------------------------------------------------- conversions
const toTicks = (s, price) => Number(money.div(price, s.tick, 0));
const toSteps = (s, qty) => Number(money.div(qty, s.step, 0));
const priceOf = (s, ticks) => money.fixed(money.mul(String(ticks), s.tick), s.tickDp);
const qtyOf = (s, steps) => money.fixed(money.mul(String(steps), s.step), s.stepDp);

const gauss = () => {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const between = (lo, hi) => lo + Math.random() * (hi - lo);

// ---------------------------------------------------------------- start-up
/**
 * Loads tickers, books, tapes and candles from the seed files, anchors their
 * times to now, and puts the database's resting orders on the books.
 */
export async function init() {
  if (markets.size) return;
  const marketList = (await fetchSeed('markets.json')).markets;
  const seedOrders = (await fetchSeed('orders.json')).items;
  const files = await Promise.all(marketList.map(async (mk) => ({
    book: await fetchSeed(`orderbook.${mk.symbol}.json`),
    trades: (await fetchSeed(`trades.${mk.symbol}.json`)).trades,
    candles: await fetchSeed(`candles.${mk.symbol}.15m.json`).then((d) => d.candles).catch(() => null),
  })));

  // The boards' "now" lands on the real now; the tapes keep their gaps.
  const boardNow = Date.parse(db().meta.boardNow);
  const offset = Date.now() - 1000 - boardNow;

  marketList.forEach((mk, i) => {
    const config = db().markets.find((x) => x.symbol === mk.symbol) ?? mk;
    const s = {
      symbol: mk.symbol,
      base: mk.baseAsset,
      quote: mk.quoteAsset,
      tick: config.tickSize,
      step: config.stepSize,
      tickDp: money.decimalsOf(config.tickSize),
      stepDp: money.decimalsOf(config.stepSize),
      status: config.status,
      ticker: { ...mk.ticker },
      seedQuoteVolume: mk.ticker.quoteVolume,
      seq: files[i].book.seq,
      humans: new Map(),
      anon: { bids: [], asks: [] },
      trades: files[i].trades.map((t) => ({ ...t, time: new Date(Date.parse(t.time) + offset).toISOString() })),
      candles: {},
      published: { bids: new Map(), asks: new Map() },
      lastCommand: null,
      lastTradeAt: null,
    };

    // The anonymous ladder: the board's levels minus the seeded people's orders.
    const seeded = seedOrders.filter((o) => o.market === s.symbol && (o.status === 'open' || o.status === 'partially_filled'));
    const minus = { bids: new Map(), asks: new Map() };
    for (const o of seeded) {
      const side = minus[o.side === 'buy' ? 'bids' : 'asks'];
      const t = toTicks(s, o.price);
      side.set(t, (side.get(t) ?? 0) + toSteps(s, money.sub(o.quantity, o.filledQuantity)));
    }
    for (const side of ['bids', 'asks']) {
      for (const [p, q] of files[i].book[side]) {
        const t = toTicks(s, p);
        const steps = toSteps(s, q) - (minus[side].get(t) ?? 0);
        if (steps > 0) s.anon[side].push({ p: t, q: steps });
      }
    }

    const bestBid = files[i].book.bids[0]?.[0];
    const bestAsk = files[i].book.asks[0]?.[0];
    s.mid = bestBid && bestAsk ? Math.floor((toTicks(s, bestBid) + toTicks(s, bestAsk)) / 2) : toTicks(s, s.ticker.last);
    s.baseMid = s.mid;
    s.sigma = Math.max(1, Math.round(toTicks(s, s.ticker.last) * 0.00004));
    // About half the board tape's average trade (0.035 BTC), so 24h volumes creep up slowly.
    s.typicalSize = Math.max(1, Math.round(toSteps(s, s.ticker.volume) / 4800));
    // A spare ladder for when a halted market resumes
    s.template = s.anon.bids.length ? null : defaultLadder(s);

    s.lastTradeAt = s.trades[0]?.time ?? null;
    s.ready = false;
    buildCandles(s, files[i].candles);
    markets.set(s.symbol, s);
  });

  // People's resting orders go on the books, behind what is already there.
  for (const o of db().orders) {
    if (o.status === 'open' || o.status === 'partially_filled') rest(o);
  }
  for (const [symbol, h] of Object.entries(healthSeed())) {
    const s = markets.get(symbol);
    if (s) s.lastCommand = h;
  }
  for (const s of markets.values()) {
    s.published = levels(s);
    s.ready = true;
  }
}

function healthSeed() {
  const out = {};
  for (const m of db().health?.engine?.markets ?? []) out[m.symbol] = m.lastCommand;
  return out;
}

function defaultLadder(s) {
  const last = toTicks(s, s.ticker.last);
  const gap = Math.max(1, Math.round(last * 0.0004));
  const size = Math.max(1, s.typicalSize * 3);
  return {
    bids: Array.from({ length: 5 }, (_, i) => ({ p: last - gap * (i + 1), q: size * (i + 1) })),
    asks: Array.from({ length: 5 }, (_, i) => ({ p: last + gap * (i + 1), q: size * (i + 1) })),
  };
}

// ---------------------------------------------------------------- candles
function buildCandles(s, seed15m) {
  const nowSec = Math.floor(Date.now() / 1000);
  const last = toTicks(s, s.ticker.last);
  for (const [interval, sec] of Object.entries(INTERVALS)) {
    const forming = Math.floor(nowSec / sec) * sec;
    let list = [];
    if (interval === '15m' && seed15m?.length) {
      // The board's chart: keep its shape, slide it onto the current 15-minute slots.
      const shift = forming - seed15m[seed15m.length - 1].time;
      list = seed15m.map((c) => ({ time: c.time + shift, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
    }
    const needed = HISTORY - list.length;
    if (needed > 0) {
      const endClose = list.length ? toTicks(s, list[0].open) : last;
      const endTime = list.length ? list[0].time - sec : forming;
      list = [...generate(s, sec, needed, endClose, endTime), ...list];
    }
    s.candles[interval] = list;
  }
}

/** `count` candles ending at `endTime`, the last one closing at `endClose` ticks. */
function generate(s, sec, count, endClose, endTime) {
  const move = Math.max(1, Math.round(endClose * 0.0011 * Math.sqrt(sec / 900)));
  const vol = Math.max(1, s.typicalSize * 4 * Math.sqrt(sec / 900));
  const closes = new Array(count);
  closes[count - 1] = endClose;
  for (let i = count - 2; i >= 0; i -= 1) closes[i] = Math.max(1, closes[i + 1] - Math.round(gauss() * move * 0.6));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const open = i === 0 ? closes[0] + Math.round(gauss() * move * 0.3) : closes[i - 1];
    const close = closes[i];
    const high = Math.max(open, close) + Math.round(Math.abs(gauss()) * move * 0.35);
    const low = Math.min(open, close) - Math.round(Math.abs(gauss()) * move * 0.35);
    out.push({
      time: endTime - (count - 1 - i) * sec,
      open: priceOf(s, open),
      high: priceOf(s, high),
      low: priceOf(s, low),
      close: priceOf(s, close),
      volume: qtyOf(s, Math.max(1, Math.round(vol * between(0.3, 1.7)))),
    });
  }
  return out;
}

function updateCandles(s, priceStr, qtyStr, timeMs) {
  const sec = Math.floor(timeMs / 1000);
  for (const [interval, len] of Object.entries(INTERVALS)) {
    const list = s.candles[interval];
    const slot = Math.floor(sec / len) * len;
    let c = list[list.length - 1];
    if (!c || c.time < slot) {
      const open = c ? c.close : priceStr;
      c = { time: slot, open, high: open, low: open, close: open, volume: money.fixed('0', s.stepDp) };
      list.push(c);
      if (list.length > HISTORY + 50) list.shift();
    }
    if (money.gt(priceStr, c.high)) c.high = priceStr;
    if (money.lt(priceStr, c.low)) c.low = priceStr;
    c.close = priceStr;
    c.volume = money.fixed(money.add(c.volume, qtyStr), s.stepDp);
    publish(`candles:${s.symbol}:${interval}`, 'candle', { symbol: s.symbol, interval, ...c });
  }
}

/** Opens new candles when an interval rolls over without a trade. */
function rollCandles() {
  const sec = Math.floor(Date.now() / 1000);
  for (const s of markets.values()) {
    for (const [interval, len] of Object.entries(INTERVALS)) {
      const list = s.candles[interval];
      const c = list[list.length - 1];
      const slot = Math.floor(sec / len) * len;
      if (c && c.time < slot) {
        const next = { time: slot, open: c.close, high: c.close, low: c.close, close: c.close, volume: money.fixed('0', s.stepDp) };
        list.push(next);
        if (list.length > HISTORY + 50) list.shift();
        publish(`candles:${s.symbol}:${interval}`, 'candle', { symbol: s.symbol, interval, ...next });
      }
    }
  }
}

// ---------------------------------------------------------------- the book
/** Aggregated levels: Map ticks -> steps, anonymous and people together. */
function levels(s) {
  const bids = new Map();
  const asks = new Map();
  for (const l of s.anon.bids) bids.set(l.p, (bids.get(l.p) ?? 0) + l.q);
  for (const l of s.anon.asks) asks.set(l.p, (asks.get(l.p) ?? 0) + l.q);
  for (const h of s.humans.values()) {
    const side = h.side === 'buy' ? bids : asks;
    side.set(h.p, (side.get(h.p) ?? 0) + h.q);
  }
  return { bids, asks };
}

function sorted(map, side) {
  return [...map.entries()].sort((a, b) => (side === 'bids' ? b[0] - a[0] : a[0] - b[0]));
}

/** Publishes the levels that changed since the last publish, with the next seq. */
function publishBook(s) {
  if (!s.ready) return;
  const now = levels(s);
  const deltas = { bids: [], asks: [] };
  for (const side of ['bids', 'asks']) {
    const before = s.published[side];
    const after = now[side];
    for (const [p, q] of after) if (before.get(p) !== q) deltas[side].push([priceOf(s, p), qtyOf(s, q)]);
    for (const p of before.keys()) if (!after.has(p)) deltas[side].push([priceOf(s, p), '0']);
  }
  s.published = now;
  if (!deltas.bids.length && !deltas.asks.length) return;
  s.seq += 1;
  publish(`market:${s.symbol}`, 'orderbook', { symbol: s.symbol, seq: s.seq, bids: deltas.bids, asks: deltas.asks });
}

export function snapshot(symbol, depth = 50) {
  const s = market(symbol);
  const { bids, asks } = levels(s);
  return {
    seq: s.seq,
    bids: sorted(bids, 'bids').slice(0, depth).map(([p, q]) => [priceOf(s, p), qtyOf(s, q)]),
    asks: sorted(asks, 'asks').slice(0, depth).map(([p, q]) => [priceOf(s, p), qtyOf(s, q)]),
  };
}

export function best(symbol) {
  const s = market(symbol);
  const { bids, asks } = levels(s);
  const bid = sorted(bids, 'bids')[0];
  const ask = sorted(asks, 'asks')[0];
  return { bid: bid ? priceOf(s, bid[0]) : null, ask: ask ? priceOf(s, ask[0]) : null };
}

/** Puts a person's open order on the book, behind what already rests at its price. */
export function rest(order) {
  const s = markets.get(order.market);
  if (!s) return;
  const p = toTicks(s, order.price);
  const q = toSteps(s, money.sub(order.quantity, order.filledQuantity));
  if (q <= 0) return;
  const anonSide = order.side === 'buy' ? s.anon.bids : s.anon.asks;
  const ahead = anonSide.filter((l) => l.p === p).reduce((n, l) => n + l.q, 0);
  s.humans.set(order.id, { id: order.id, userId: order.userId, side: order.side, p, q, ahead, createdAt: order.createdAt });
  publishBook(s);
}

/** Takes a person's order off the book (cancelled or filled elsewhere). */
export function unrest(orderId) {
  for (const s of markets.values()) {
    if (s.humans.delete(orderId)) {
      publishBook(s);
      return;
    }
  }
}

/** Your resting quantity at each price, for the ladder's "You" tags. */
export function restingFor(userId, symbol) {
  const s = market(symbol);
  return [...s.humans.values()].filter((h) => h.userId === userId).map((h) => ({ orderId: h.id, side: h.side, price: priceOf(s, h.p), quantity: qtyOf(s, h.q) }));
}

/**
 * Walks the opposite side for an incoming order, best price first and oldest
 * first within a price, at the resting price. Returns the fills it took and
 * the taker's own resting orders it met (self-trade prevention cancels those).
 * `quote` limits a market buy by the USDT it may spend.
 */
export function take(symbol, { side, limit = null, quantity = null, quote = null, userId }) {
  const s = market(symbol);
  const limitT = limit != null ? toTicks(s, limit) : null;
  let remaining = quantity != null ? toSteps(s, quantity) : Infinity;
  let budget = quote;
  const fills = [];
  const selfTrades = [];
  const opposite = side === 'buy' ? 'asks' : 'bids';
  const anonList = s.anon[opposite];

  for (const [p] of sorted(levels(s)[opposite], opposite)) {
    if (remaining <= 0) break;
    if (limitT != null && (side === 'buy' ? p > limitT : p < limitT)) break;
    const priceStr = priceOf(s, p);
    const affordable = () => {
      if (budget == null) return Infinity;
      const most = money.roundToStep(money.div(budget, priceStr, s.stepDp, 'down'), s.step, 'down');
      return toSteps(s, most);
    };

    const anon = anonList.find((l) => l.p === p);
    const people = [...s.humans.values()].filter((h) => h.p === p && h.side !== side).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const queue = [];
    const aheadOfPeople = Math.min(anon?.q ?? 0, people[0]?.ahead ?? Infinity);
    if (aheadOfPeople > 0) queue.push({ anon: true, q: aheadOfPeople });
    queue.push(...people.map((h) => ({ human: h })));
    const anonLeft = (anon?.q ?? 0) - aheadOfPeople;
    if (anonLeft > 0) queue.push({ anon: true, q: anonLeft });

    for (const slot of queue) {
      if (remaining <= 0) break;
      const can = Math.min(remaining, affordable());
      if (can <= 0) {
        remaining = 0;
        break;
      }
      if (slot.human && slot.human.userId === userId) {
        selfTrades.push(slot.human.id);
        s.humans.delete(slot.human.id);
        continue;
      }
      const available = slot.anon ? slot.q : slot.human.q;
      const n = Math.min(can, available);
      if (n <= 0) continue;
      if (slot.anon) {
        anon.q -= n;
        for (const h of people) h.ahead = Math.max(0, h.ahead - n);
      } else {
        slot.human.q -= n;
        if (slot.human.q === 0) s.humans.delete(slot.human.id);
      }
      remaining -= n;
      const qtyStr = qtyOf(s, n);
      if (budget != null) budget = money.sub(budget, money.mul(priceStr, qtyStr));
      fills.push({ price: priceStr, quantity: qtyStr, makerOrderId: slot.human?.id ?? null, makerUserId: slot.human?.userId ?? null });
    }
  }
  s.anon[opposite] = anonList.filter((l) => l.q > 0);
  return { fills, selfTrades };
}

/** Prints fills to the tape, the ticker and the candles, then sends the book. */
export function print(symbol, fills, takerSide, timeIso = new Date().toISOString()) {
  const s = market(symbol);
  for (const f of fills) {
    const trade = { id: f.tradeId ?? newId(), price: f.price, quantity: f.quantity, takerSide, time: timeIso };
    s.trades.unshift(trade);
    if (s.trades.length > 50) s.trades.length = 50;
    const t = s.ticker;
    t.last = f.price;
    if (money.gt(f.price, t.high)) t.high = f.price;
    if (money.lt(f.price, t.low)) t.low = f.price;
    t.volume = money.fixed(money.add(t.volume, f.quantity), s.stepDp);
    t.quoteVolume = money.fixed(money.add(t.quoteVolume, money.mul(f.price, f.quantity)), 2);
    t.changePct = money.pct(money.sub(t.last, t.open), t.open, 2);
    s.lastTradeAt = timeIso;
    publish(`market:${symbol}`, 'trade', { ...trade, symbol });
    updateCandles(s, f.price, f.quantity, Date.parse(timeIso));
  }
  if (fills.length) publishTicker(s);
  publishBook(s);
}

function publishTicker(s) {
  const payload = { symbol: s.symbol, ...s.ticker };
  publish('tickers', 'ticker', payload);
  publish(`market:${s.symbol}`, 'ticker', payload);
}

// ---------------------------------------------------------------- reads
function market(symbol) {
  const s = markets.get(symbol);
  if (!s) throw new Error(`Unknown market ${symbol}`);
  return s;
}

export const has = (symbol) => markets.has(symbol);
export const ticker = (symbol) => ({ ...market(symbol).ticker });
export const trades = (symbol, limit = 50) => market(symbol).trades.slice(0, limit);
export const status = (symbol) => market(symbol).status;

export function candles(symbol, interval, limit = 500) {
  const list = market(symbol).candles[interval];
  if (!list) return null;
  return list.slice(-limit).map((c) => ({ ...c }));
}

export function setStatus(symbol, next, detail) {
  const s = market(symbol);
  s.status = next;
  s.lastCommand = { type: 'config', detail, at: new Date().toISOString() };
  if (next === 'active') {
    if (!s.anon.bids.length && !s.anon.asks.length) {
      const ladder = s.template ?? defaultLadder(s);
      s.anon = { bids: ladder.bids.map((l) => ({ ...l })), asks: ladder.asks.map((l) => ({ ...l })) };
      s.mid = toTicks(s, s.ticker.last);
      s.baseMid = s.mid;
    }
  } else {
    // The bot cancels its ladder on any halt.
    if (s.anon.bids.length || s.anon.asks.length) s.template = { bids: s.anon.bids, asks: s.anon.asks };
    s.anon = { bids: [], asks: [] };
  }
  publish(`market:${symbol}`, 'market.status', { symbol, status: next });
  publishBook(s);
}

export function noteCommand(symbol, type) {
  const s = markets.get(symbol);
  if (s) s.lastCommand = { type, at: new Date().toISOString() };
}

/** Per-market engine figures for the admin System page. */
export function engineMarkets() {
  return [...markets.values()].map((s) => {
    const { bids, asks } = levels(s);
    return {
      symbol: s.symbol,
      status: s.status,
      waiting: db().orders.filter((o) => o.market === s.symbol && o.status === 'pending').length,
      lastCommand: s.lastCommand,
      bookLevels: { bids: bids.size, asks: asks.size },
      lastTradeAt: s.lastTradeAt,
      maker: s.status === 'active' ? 'quoting' : 'cancelled',
    };
  });
}

// ---------------------------------------------------------------- the simulation
/** The engine settles people's maker fills through this hook. */
export function onMakerFill(hook) {
  makerFillHook = hook;
}

function requote(s) {
  if (s.status !== 'active') return;
  const drift = Math.round((s.baseMid - s.mid) * 0.02 + gauss() * s.sigma);
  const { bids: humanBids, asks: humanAsks } = (() => {
    const b = [];
    const a = [];
    for (const h of s.humans.values()) (h.side === 'buy' ? b : a).push(h.p);
    return { bids: b, asks: a };
  })();
  if (drift !== 0) {
    s.mid += drift;
    for (const l of s.anon.bids) l.p += drift;
    for (const l of s.anon.asks) l.p += drift;
    // Re-quoted orders join the back of each queue.
    for (const h of s.humans.values()) h.ahead = 0;
  }
  for (const l of [...s.anon.bids, ...s.anon.asks]) {
    if (Math.random() < 0.3) l.q = Math.max(1, Math.round(l.q * between(0.85, 1.15)));
  }
  // The bot never quotes through a person's order.
  const topHumanBid = Math.max(-Infinity, ...humanBids);
  const topHumanAsk = Math.min(Infinity, ...humanAsks);
  s.anon.asks = s.anon.asks.filter((l) => l.p > topHumanBid);
  s.anon.bids = s.anon.bids.filter((l) => l.p < topHumanAsk);
  // Keep the ladder about as deep as it started.
  while (s.anon.asks.length < 12) {
    const top = s.anon.asks[s.anon.asks.length - 1]?.p ?? Math.max(s.mid, topHumanBid) + s.sigma;
    s.anon.asks.push({ p: top + Math.max(1, Math.round(s.sigma * between(3, 12))), q: Math.max(1, Math.round(s.typicalSize * between(1, 40))) });
  }
  while (s.anon.bids.length < 12) {
    const bottom = s.anon.bids[s.anon.bids.length - 1]?.p ?? Math.min(s.mid, topHumanAsk) - s.sigma;
    s.anon.bids.push({ p: bottom - Math.max(1, Math.round(s.sigma * between(3, 12))), q: Math.max(1, Math.round(s.typicalSize * between(1, 40))) });
  }
  s.anon.asks.sort((a, b) => a.p - b.p);
  s.anon.bids.sort((a, b) => b.p - a.p);
  s.lastCommand = { type: Math.random() < 0.5 ? 'place' : 'cancel', at: new Date().toISOString() };
  publishBook(s);
}

function botTrade(s) {
  if (s.status !== 'active') return;
  const lean = Math.max(-0.25, Math.min(0.25, (s.baseMid - s.mid) / (s.sigma * 40)));
  const side = Math.random() < 0.5 + lean ? 'buy' : 'sell';
  const opposite = side === 'buy' ? 'asks' : 'bids';
  const top = sorted(levels(s)[opposite], opposite)[0];
  if (!top) return;
  const size = Math.max(1, Math.min(top[1], Math.round(s.typicalSize * Math.exp(gauss() * 0.9))));
  const { fills } = take(s.symbol, { side, quantity: qtyOf(s, size), userId: BOT_TAKER });
  if (!fills.length) return;
  const time = new Date().toISOString();
  for (const f of fills) {
    f.tradeId = newId();
    if (f.makerOrderId && makerFillHook) makerFillHook({ orderId: f.makerOrderId, price: f.price, quantity: f.quantity, tradeId: f.tradeId, time });
  }
  print(s.symbol, fills, side, time);
}

function loop(fn, lo, hi) {
  const tick = () => {
    fn();
    timers.push(setTimeout(tick, between(lo, hi)));
  };
  timers.push(setTimeout(tick, between(lo, hi)));
}

export function start() {
  if (started) return;
  started = true;
  // The board's tape prints about one trade every 24 s; the demo runs a bit busier.
  for (const s of markets.values()) {
    loop(() => requote(s), 1400, 3200);
    loop(() => botTrade(s), 6000, 20000);
  }
  timers.push(setInterval(rollCandles, 1000));
  timers.push(setInterval(() => {
    lastHeartbeat = Date.now();
    publish('tickers', 'engine.status', { status: 'live', leaderId: LEADER_ID, heartbeatAt: new Date(lastHeartbeat).toISOString() });
  }, 5000));
}

let lastHeartbeat = Date.now();
/** Seconds since the engine's last heartbeat (written every 5 s). */
export const heartbeatAge = () => Math.round((Date.now() - lastHeartbeat) / 1000);

/** USDT traded on every market since this page loaded the seed tickers. */
export function volumeSinceStart() {
  return money.sum([...markets.values()].map((s) => money.sub(s.ticker.quoteVolume, s.seedQuoteVolume)));
}

export function stop() {
  for (const t of timers) {
    clearTimeout(t);
    clearInterval(t);
  }
  timers = [];
  started = false;
}

/** Forgets every market, for a reset; init() loads them again. */
export function clear() {
  stop();
  markets.clear();
}
