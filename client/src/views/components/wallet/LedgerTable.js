// LedgerTable (section 5; section 7, Order ledger): one row per ledger entry,
// with the signed change to the free (available) and locked balance. The trade
// page and the order drawer show the entries one order wrote.

import { h } from '../../dom.js';

/** rows: [{ key, type, asset, available, locked }] */
export function LedgerTable({ rows, caption, empty = 'No ledger entries yet.' }) {
  return h('table', { class: 'ledger-table' },
    h('caption', { class: 'sr-only' }, caption),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col' }, 'Type'),
      h('th', { scope: 'col' }, 'Asset'),
      h('th', { scope: 'col', class: 'num' }, 'Available'),
      h('th', { scope: 'col', class: 'num' }, 'Locked'))),
    h('tbody', {}, rows.length
      ? rows.map((r) => h('tr', { key: r.key },
        h('td', { class: 't-mono ledger-type' }, r.type),
        h('td', {}, r.asset),
        h('td', { class: 'num t-mono' }, r.available),
        h('td', { class: 'num t-mono' }, r.locked)))
      : h('tr', {}, h('td', { colspan: 4, class: 'ledger-empty' }, empty))));
}
