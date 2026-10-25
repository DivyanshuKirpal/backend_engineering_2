// useChartPresenter (section 5, PriceChart and ChartToolbar): candles for the
// picked interval from GET /markets/:symbol/candles, kept current by candle
// events on candles:{symbol}:{interval} and reloaded after a reconnect. It
// turns the candle strings into numbers for the drawing only (section 1):
// every position is a share of the plot (0 at the top or the left, 1 at the
// bottom or the right), and every label is ready to print.

import * as marketApi from '../../models/api/market.api.js';
import * as candlesModel from '../../models/domain/candles.model.js';
import * as money from '../../models/domain/money.js';
import { socket } from '../../models/realtime/socket.js';
import { fixed, price as fmtPrice, significant, pair } from '../formatters/number.format.js';
import { candleLabel, localSeconds, listTime } from '../formatters/date.format.js';

export const INTERVALS = [
  { key: '1m', seconds: 60, name: '1-minute' },
  { key: '5m', seconds: 300, name: '5-minute' },
  { key: '15m', seconds: 900, name: '15-minute' },
  { key: '1h', seconds: 3600, name: 'hourly' },
  { key: '4h', seconds: 14400, name: '4-hour' },
  { key: '1d', seconds: 86400, name: 'daily' },
];

const LOAD = 240;
// Time labels sit at least this many candles apart, then on a round local time.
const LABEL_GAP = 10;
const LABEL_STEPS = [60, 300, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800, 1209600, 2592000];

/** The smallest of 1, 2, 3 or 5 times a power of ten that is at least `raw` (the Trade board steps by 300). */
function niceStep(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 3, 5, 10]) if (m * power >= raw) return m * power;
  return 10 * power;
}

const decimalsOfStep = (step) => (Number.isInteger(step) ? 0 : String(step).split('.')[1].length);

/**
 * `p` is the trade presenter's plumbing; `market()` returns the market config.
 */
export function createChartPresenter(p, { symbol, market }) {
  let interval = '15m';
  let status = 'loading';
  let error = null;
  let series = [];
  // What the view has room for: candle slots, its size, and the price area's height in px
  let room = { slots: 80, width: 0, height: 0, priceHeight: 300 };
  let hover = null;
  let token = 0;
  let roomOff = null;

  const meta = () => INTERVALS.find((i) => i.key === interval);

  function join() {
    roomOff?.();
    roomOff = socket.subscribe(`candles:${symbol}:${interval}`);
  }

  async function load() {
    const mine = ++token;
    status = series.length ? status : 'loading';
    p.changed();
    try {
      const data = await marketApi.candles(symbol, { interval, limit: LOAD });
      if (mine !== token || p.disposed) return;
      series = data.candles;
      status = 'ready';
      error = null;
    } catch (err) {
      if (mine !== token || p.disposed) return;
      status = 'error';
      error = err;
    }
    p.changed();
  }

  p.own(socket.on('candle', (c) => {
    if (c.symbol !== symbol || c.interval !== interval || status !== 'ready') return;
    const { symbol: _s, interval: _i, ...candle } = c;
    series = candlesModel.merge(series, candle);
    p.changed();
  }));
  p.own(socket.on('reconnect', () => load()));
  p.own(() => roomOff?.());
  join();
  load();

  function plot(m) {
    const { slots } = room;
    const shown = series.slice(-slots);
    if (!shown.length || !m) return null;
    const n = shown.map((c) => ({
      time: c.time,
      o: money.toNumber(c.open), h: money.toNumber(c.high), l: money.toNumber(c.low), c: money.toNumber(c.close), v: money.toNumber(c.volume),
    }));
    let top = Math.max(...n.map((c) => c.h));
    let bottom = Math.min(...n.map((c) => c.l));
    const pad = Math.max((top - bottom) * 0.12, top * 0.0005);
    top += pad;
    bottom -= pad;
    const span = top - bottom;
    const y = (v) => (top - v) / span;
    const maxVolume = Math.max(...n.map((c) => c.v)) || 1;
    // Candles fill the slots from the right, as the newest one is the one forming.
    const offset = slots - n.length;
    const x = (i) => (offset + i + 0.5) / slots;

    // Grid lines at least 50 px apart
    const step = niceStep((span * 50) / Math.max(120, room.priceHeight));
    const stepDecimals = decimalsOfStep(step);
    const grid = [];
    for (let v = Math.ceil(bottom / step) * step; v <= top; v += step) {
      grid.push({ key: v.toFixed(stepDecimals), y: y(v), label: fixed(v.toFixed(stepDecimals), stepDecimals) });
    }

    const sec = meta().seconds;
    const labelStep = LABEL_STEPS.find((s) => s >= LABEL_GAP * sec) ?? LABEL_STEPS[LABEL_STEPS.length - 1];
    const times = [];
    let lastLabelled = -Infinity;
    n.forEach((c, i) => {
      if (i === 0) return;
      const crossed = Math.floor(localSeconds(c.time) / labelStep) !== Math.floor(localSeconds(n[i - 1].time) / labelStep);
      if (!crossed || i - lastLabelled < LABEL_GAP / 2) return;
      lastLabelled = i;
      times.push({ key: c.time, x: x(i), label: candleLabel(c.time, n[i - 1].time, sec) });
    });

    const last = shown[shown.length - 1];
    const lastUp = !money.lt(last.close, last.open);
    return {
      slots,
      width: room.width,
      height: room.height,
      candles: n.map((c, i) => ({
        key: c.time,
        x: x(i),
        open: y(c.o),
        high: y(c.h),
        low: y(c.l),
        close: y(c.c),
        up: c.c >= c.o,
        volume: c.v / maxVolume,
      })),
      grid,
      times,
      last: {
        y: y(money.toNumber(last.close)),
        label: significant(last.close, 6, 'down'),
        short: significant(last.close, 5, 'down'),
        tone: lastUp ? 'up' : 'down',
      },
      low: fmtPrice(String(Math.min(...n.map((c) => c.l))), m.tickSize),
      high: fmtPrice(String(Math.max(...n.map((c) => c.h))), m.tickSize),
      from: listTime(new Date(shown[0].time * 1000)),
    };
  }

  function readout(m) {
    const shown = series.slice(-room.slots);
    const c = hover != null && shown[hover] ? shown[hover] : shown[shown.length - 1];
    if (!c || !m) return null;
    return {
      open: fmtPrice(c.open, m.tickSize),
      high: fmtPrice(c.high, m.tickSize),
      low: fmtPrice(c.low, m.tickSize),
      close: fmtPrice(c.close, m.tickSize),
      tone: money.lt(c.close, c.open) ? 'down' : 'up',
      time: listTime(new Date(c.time * 1000)),
    };
  }

  return {
    vm() {
      const m = market();
      const drawn = status === 'ready' ? plot(m) : null;
      return {
        status: status === 'ready' && !drawn ? 'empty' : status,
        error: error ? 'The candles didn\'t load.' : null,
        intervals: INTERVALS.map((i) => ({ key: i.key, label: i.key, name: `${i.name} candles`, current: i.key === interval })),
        interval,
        ohlc: status === 'ready' ? readout(m) : null,
        plot: drawn,
        label: drawn
          ? `${pair(symbol)} price chart, ${meta().name} candles since ${drawn.from}: high ${drawn.high}, low ${drawn.low}, last ${fmtPrice(series[series.length - 1].close, m.tickSize)}.`
          : `${pair(symbol)} price chart`,
      };
    },
    actions: {
      setInterval(key) {
        if (key === interval || !INTERVALS.some((i) => i.key === key)) return;
        interval = key;
        series = [];
        hover = null;
        status = 'loading';
        join();
        load();
      },
      /** The view reports its size and how many candles fit; positions are worked out for that. */
      setRoom({ slots, width, height, priceHeight }) {
        const next = { slots: Math.max(10, Math.min(LOAD, Math.floor(slots))), width, height, priceHeight };
        if (next.slots === room.slots && width === room.width && height === room.height && priceHeight === room.priceHeight) return;
        if (next.slots !== room.slots) hover = null;
        room = next;
        p.changed();
      },
      hover(index) {
        const next = index == null ? null : Math.max(0, Math.min(room.slots - 1, index));
        if (next === hover) return;
        hover = next;
        p.changed();
      },
      retry: load,
    },
  };
}
