// VolumeBarChart (section 5; board Admin · Dashboard): fourteen days of
// traded volume as bars on a scale, the highest and the latest labelled, or
// the same numbers as a table. The bars are drawn in HTML, sized by the
// presenter's numbers; the chart reads as one sentence to screen readers.

import { h } from '../../dom.js';
import { Tabs } from '../ui/Tabs.js';

function Bars(v) {
  return h('div', { class: 'vbars', role: 'img', 'aria-label': v.summary },
    h('div', { class: 'vbars-plot' },
      v.ticks.map((t) => h('div', { key: `tick-${t.key}`, class: 'vbars-grid', style: { bottom: `${t.at}%` } },
        h('span', { class: 'vbars-tick t-mono' }, t.label))),
      h('div', { class: 'vbars-row' }, v.bars.map((b) => h('div', { key: b.key, class: 'vbars-col' },
        h('div', { class: 'vbars-bar', style: { height: `${b.height}%` } },
          b.labelled ? h('span', { class: 'vbars-value t-mono' }, b.value) : null))))),
    h('div', { class: 'vbars-axis', 'aria-hidden': 'true' }, v.bars.map((b) => h('span', { key: b.key, class: 't-mono' }, b.tick ? b.day : ''))));
}

function VolumeTable(v) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table volume-table' },
    h('caption', { class: 'sr-only' }, 'Traded volume per day, newest first'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Day'), h('th', { scope: 'col', class: 'num' }, 'Volume · USDT'))),
    h('tbody', {}, v.rows.map((r) => h('tr', { key: r.key }, h('td', { class: 't-mono' }, r.day), h('td', { class: 'num t-mono' }, r.volume))))));
}

/** v: the dashboard presenter's volume vm. */
export function VolumeBarChart(v, { onView }) {
  return h('section', { class: 'panel volume-panel', 'aria-labelledby': 'volume-title' },
    h('div', { class: 'volume-head' },
      h('div', {},
        h('h2', { class: 'volume-title', id: 'volume-title' }, 'Traded volume, last 14 days'),
        h('p', { class: 'volume-sub' }, 'USDT, all four markets, full days only')),
      Tabs({ items: v.tabs, onSelect: onView, label: 'Show the volume as', className: 'volume-tabs' })),
    h('div', { id: 'volume-view', role: 'tabpanel', class: 'volume-view', 'aria-label': v.view === 'chart' ? 'Chart' : 'Table' },
      v.view === 'chart' ? Bars(v) : VolumeTable(v)));
}
