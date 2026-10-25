// RecentTrades (section 5; board Trade, the TAPE panel): price, amount and
// time of each print, newest first, the price coloured by the taker's side.
// The side is also written out for screen readers, so colour isn't the only clue.

import { h } from '../../dom.js';

/** vm: { status, rows: [{ key, price, qty, time, tone, side }] }. `base` names the amount column. */
export function RecentTrades(vm, { base, onRetry } = {}) {
  if (vm.status === 'error') {
    return h('div', { class: 'tape-state' }, h('p', {}, 'The trades didn\'t load.'), h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: onRetry }, 'Try again'));
  }
  if (vm.status === 'loading') return h('div', { class: 'tape-state', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading trades…');
  if (vm.status === 'empty') return h('div', { class: 'tape-state' }, h('p', {}, 'No trades yet.'));
  return h('table', { class: 'tape' },
    h('caption', { class: 'sr-only' }, 'Recent trades, newest first'),
    h('colgroup', {}, h('col', {}), h('col', { class: 'tape-col-qty' }), h('col', { class: 'tape-col-time' })),
    h('thead', { class: 'sr-only' }, h('tr', {},
      h('th', { scope: 'col' }, 'Price'),
      h('th', { scope: 'col' }, `Amount (${base})`),
      h('th', { scope: 'col' }, 'Time'))),
    h('tbody', {}, vm.rows.map((r) => h('tr', { key: r.key },
      h('td', { class: `tape-price t-mono tone-${r.tone}` }, h('span', { class: 'sr-only' }, `${r.side}: `), r.price),
      h('td', { class: 'tape-qty t-mono' }, r.qty),
      h('td', { class: 'tape-time t-mono' }, r.time)))));
}
