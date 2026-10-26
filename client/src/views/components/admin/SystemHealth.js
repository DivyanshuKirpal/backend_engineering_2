// HealthGrid and EngineStatusCard (section 5; board Admin · System): one card
// per part of the stack with its state, and the engine market by market.

import { h, cx } from '../../dom.js';
import { StatusMarker } from '../ui/StatusMarker.js';

/** Body text with { mono } pieces in code type; the board sets a following space wider. */
const rich = (parts) => parts.map((part, i) => (typeof part === 'string'
  ? part
  : h('code', { class: cx('t-mono', { 'code-spaced': String(parts[i + 1] ?? '').startsWith(' ') }) }, part.mono)));

/** cards: the system presenter's cards. */
export function HealthGrid(cards) {
  return h('div', { class: 'health-grid' }, cards.map((c) => h('section', { key: c.key, class: 'panel health-card', 'aria-labelledby': `health-${c.key}` },
    h('div', { class: 'health-head' },
      h('h2', { id: `health-${c.key}` }, c.title),
      StatusMarker(c.state, { size: 'sm' })),
    h('p', { class: 'health-body' }, rich(c.body)),
    c.meter
      ? h('div', { class: 'health-meter' },
        h('span', { class: 'health-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${c.meter.value}%` } })),
        h('span', { class: 't-mono' }, c.meter.label))
      : null,
    c.mono ? h('p', { class: 'health-mono t-mono' }, c.mono) : null)));
}

/** rows: the system presenter's market rows. */
export function EngineStatusCard(rows) {
  return h('section', { class: 'panel engine-card', 'aria-labelledby': 'engine-title' },
    h('div', { class: 'engine-head' },
      h('h2', { id: 'engine-title' }, 'Engine, market by market'),
      h('p', {}, 'One writer per market, one command at a time')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table engine-table' },
      h('caption', { class: 'sr-only' }, 'The matching engine, market by market'),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'col-market' }, 'Market'),
        h('th', { scope: 'col', class: 'col-status' }, 'Status'),
        h('th', { scope: 'col', class: 'num col-waiting' }, 'Waiting'),
        h('th', { scope: 'col', class: 'col-last' }, 'Last command'),
        h('th', { scope: 'col', class: 'num col-levels' }, 'Book levels'),
        h('th', { scope: 'col', class: 'col-trade' }, 'Last trade'),
        h('th', { scope: 'col' }, 'Market maker'))),
      h('tbody', {}, rows.map((r) => h('tr', { key: r.key },
        h('th', { scope: 'row', class: 'col-market' }, r.market),
        h('td', {}, StatusMarker(r.status)),
        h('td', { class: 'num t-mono' }, r.waiting),
        h('td', { class: 't-mono' }, r.last),
        h('td', { class: 'num t-mono' }, r.levels),
        h('td', { class: 't-mono' }, r.lastTrade),
        h('td', { class: cx({ 'engine-quiet': r.makerQuiet }) }, r.maker)))))),
    h('p', { class: 'engine-note' }, 'Prometheus scrapes ', h('code', { class: 't-mono' }, '/metrics'), ' on both API instances and the engine. If the engine stops renewing its lock, a standby rebuilds the books and takes over.'));
}
