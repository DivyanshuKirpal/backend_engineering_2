// AllocationBar (section 7, Patterns: Allocation bar; board Wallet): value
// per asset as one stacked bar with 2 px gaps in the fixed asset order, then
// a legend with the share and the USDT value. Plain HTML; the table below
// has every figure, so the bar itself is decoration for screen readers.

import { h } from '../../dom.js';

/** vm: { segments: [{ key, asset, grow, label }], legend: [{ key, asset, code, share, value }], empty } */
export function AllocationBar(vm) {
  return h('section', { class: 'panel wallet-allocation', 'aria-labelledby': 'allocation-title' },
    h('h2', { class: 'panel-label', id: 'allocation-title' }, 'Allocation by value'),
    vm.empty
      ? h('p', { class: 'allocation-empty' }, 'Nothing to show yet: the wallet is empty.')
      : [
        h('div', { class: 'allocation-bar', 'aria-hidden': 'true' }, vm.segments.map((s) => h('span', {
          key: s.key,
          class: `allocation-segment asset-${s.asset}`,
          style: { flexGrow: s.grow },
          title: s.label,
        }))),
        h('ul', { class: 'plain allocation-legend' }, vm.legend.map((l) => h('li', { key: l.key, class: 'allocation-item' },
          h('span', { class: `allocation-swatch asset-${l.asset}`, 'aria-hidden': 'true' }),
          h('strong', { class: 'allocation-code' }, l.code),
          h('span', { class: 'allocation-share' }, l.share),
          h('span', { class: 'allocation-value t-mono' }, h('span', { class: 'sr-only' }, ', worth '), l.value, h('span', { class: 'sr-only' }, ' USDT'))))),
      ],
    h('p', { class: 'wallet-note' }, 'Values in USDT. The table below has every figure.'));
}
