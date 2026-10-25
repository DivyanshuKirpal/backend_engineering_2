// PriceChart and ChartToolbar (section 5; board Trade, the PRICE panel): a
// hand-drawn SVG candle chart (section 8: in place of Lightweight Charts)
// with volume bars, round-number grid lines, the last price as a dotted line
// and an ink tag on the axis, and time labels on round local times. The
// presenter gives every position as a share of the plot; the view measures
// itself, reports its room, and turns the shares into pixels.

import { h, s, cx } from '../../dom.js';

const TIME_AXIS = 26;
const GAP = 4;

/** Pixel layout for a chart of this size; narrow charts (phones) pack tighter. */
function geometry(width, height) {
  const narrow = width < 520;
  const axis = narrow ? 62 : 68;
  const left = narrow ? 8 : 12;
  const plotRight = width - axis - GAP;
  const plotWidth = Math.max(40, plotRight - left);
  const slots = Math.max(10, Math.floor(plotWidth / (narrow ? 7.3 : 8.5)));
  const volume = Math.round(Math.min(67, Math.max(36, height * 0.16)));
  const volumeBottom = height - TIME_AXIS;
  const volumeTop = volumeBottom - volume;
  return {
    narrow, axis, left, plotRight, plotWidth, slots,
    priceTop: 8,
    priceBottom: volumeTop - 12,
    volumeTop,
    volumeBottom,
  };
}

/** Watches the chart's box and reports the room it has (a ref, run after each draw). */
function watch(onRoom) {
  return (el) => {
    el.__onRoom = onRoom;
    if (el.__observer) return;
    const report = () => {
      if (!el.isConnected) {
        el.__observer.disconnect();
        return;
      }
      const width = Math.floor(el.clientWidth);
      const height = Math.floor(el.clientHeight);
      if (!width || !height) return;
      const g = geometry(width, height);
      el.__onRoom({ slots: g.slots, width, height, priceHeight: g.priceBottom - g.priceTop });
    };
    el.__observer = new ResizeObserver(report);
    el.__observer.observe(el);
    report();
  };
}

function Plot(plot, label, onHover) {
  const { width, height } = plot;
  const g = geometry(width, height);
  const step = g.plotWidth / plot.slots;
  const body = Math.max(1, step * 0.625);
  const px = (x) => g.left + x * g.plotWidth;
  const py = (y) => g.priceTop + y * (g.priceBottom - g.priceTop);
  const crisp = (v) => Math.round(v) + 0.5;
  const lastY = py(plot.last.y);
  const tagHalf = 9.5;
  const offset = plot.slots - plot.candles.length;

  const hover = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left - g.left) / step) - offset;
    onHover(i >= 0 && i < plot.candles.length ? i : null);
  };

  return s('svg', {
    class: 'chart-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label,
    onPointerMove: hover, onPointerLeave: () => onHover(null),
  },
  s('g', { class: 'chart-grid', 'aria-hidden': 'true' }, plot.grid.map((line) => s('line', {
    key: line.key, x1: 0, x2: g.plotRight, y1: crisp(py(line.y)), y2: crisp(py(line.y)),
  }))),
  s('g', { class: 'chart-volume', 'aria-hidden': 'true' }, plot.candles.map((c) => {
    const tall = Math.max(1, c.volume * (g.volumeBottom - g.volumeTop));
    return s('rect', { key: c.key, x: px(c.x) - body / 2, y: g.volumeBottom - tall, width: body, height: tall });
  })),
  s('line', { class: 'chart-last-line', x1: 0, x2: g.plotRight, y1: crisp(lastY), y2: crisp(lastY), 'aria-hidden': 'true' }),
  s('g', { class: 'chart-candles', 'aria-hidden': 'true' }, plot.candles.map((c) => {
    const x = px(c.x);
    const top = py(Math.min(c.open, c.close));
    const tall = Math.max(1, py(Math.max(c.open, c.close)) - top);
    return s('g', { key: c.key, class: c.up ? 'candle-up' : 'candle-down' },
      s('line', { x1: crisp(x - 0.5), x2: crisp(x - 0.5), y1: py(c.high), y2: py(c.low) }),
      s('rect', { x: x - body / 2, y: top, width: body, height: tall }));
  })),
  s('g', { class: 'chart-axis', 'aria-hidden': 'true' }, plot.grid
    .filter((line) => Math.abs(py(line.y) - lastY) > tagHalf + 6)
    .map((line) => s('text', { key: line.key, x: g.plotRight + GAP + 6, y: py(line.y) + 4 }, line.label))),
  s('g', { class: cx('chart-last-tag', `tone-${plot.last.tone}`), 'aria-hidden': 'true' },
    s('rect', { x: width - g.axis, y: lastY - tagHalf, width: g.axis, height: tagHalf * 2 }),
    s('text', { x: width - g.axis + 5, y: lastY + 4 }, g.narrow ? plot.last.short : plot.last.label)),
  s('g', { class: 'chart-times', 'aria-hidden': 'true' }, plot.times.map((t) => s('text', {
    key: t.key, x: px(t.x), y: height - 10, 'text-anchor': 'middle',
  }, t.label))));
}

/**
 * vm: the chart presenter's vm. actions: { setRoom, hover, retry }.
 * The box takes its size from the panel; the SVG is drawn once it is measured.
 */
export function PriceChart(vm, actions, { id = null } = {}) {
  let inner = null;
  if (vm.status === 'error') {
    inner = h('div', { class: 'chart-state' }, h('p', {}, vm.error), h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: actions.retry }, 'Try again'));
  } else if (vm.status === 'loading') {
    inner = h('div', { class: 'chart-state', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading candles…');
  } else if (vm.status === 'empty') {
    inner = h('div', { class: 'chart-state' }, h('p', {}, 'No trades in this range yet.'));
  } else if (vm.plot?.width) {
    inner = Plot(vm.plot, vm.label, actions.hover);
  }
  return h('div', { class: 'chart', id, ref: watch(actions.setRoom) }, inner);
}

/** The interval buttons and, on wide screens, the hovered or last candle's O, H, L and C. */
export function ChartToolbar(vm, actions, { readout = true } = {}) {
  const o = vm.ohlc;
  return [
    h('div', { class: 'interval-group', role: 'group', 'aria-label': 'Candle interval' }, vm.intervals.map((i) => h('button', {
      key: i.key,
      type: 'button',
      class: cx('interval-btn', 't-mono', { current: i.current }),
      'aria-pressed': String(i.current),
      'aria-label': i.name,
      onClick: () => actions.setInterval(i.key),
    }, i.label))),
    readout && o ? h('p', { class: 'chart-ohlc t-mono', 'aria-live': 'off' },
      h('span', { class: 'sr-only' }, `Candle at ${o.time}: `),
      h('abbr', { title: 'Open' }, 'O'), ' ', h('span', {}, o.open), ' ',
      h('abbr', { title: 'High' }, 'H'), ' ', h('span', {}, o.high), ' ',
      h('abbr', { title: 'Low' }, 'L'), ' ', h('span', {}, o.low), ' ',
      h('abbr', { title: 'Close' }, 'C'), ' ', h('span', { class: `tone-${o.tone}` }, o.close)) : null,
  ];
}
