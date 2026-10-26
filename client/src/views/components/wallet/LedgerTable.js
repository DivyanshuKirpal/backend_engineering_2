// LedgerTable (section 5; section 7, Order ledger and Ledger tab): one row per
// ledger entry, with the signed change to the free (available) and locked
// balance. LedgerTable shows the entries one order wrote (Trade, the order
// drawer); LedgerHistoryTable adds the time, the balance after each entry and
// its source (History).

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

/**
 * The Ledger tab's table (section 7, Patterns: Ledger tab): every entry with
 * the change to free and locked, the balance after it, and its source.
 * rows: [{ key, time, type, asset, freeChange, lockedChange, freeAfter, lockedAfter, source: { label, href } }]
 */
export function LedgerHistoryTable({ rows, empty }) {
  return h('table', { class: 'table ledger-history' },
    h('caption', { class: 'sr-only' }, 'Ledger entries, newest first'),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', class: 'col-time' }, 'Time'),
      h('th', { scope: 'col', class: 'col-type' }, 'Entry'),
      h('th', { scope: 'col', class: 'col-asset' }, 'Asset'),
      h('th', { scope: 'col', class: 'num col-free-change' }, 'Free change'),
      h('th', { scope: 'col', class: 'num col-locked-change' }, 'Locked change'),
      h('th', { scope: 'col', class: 'num col-free-after' }, 'Free after'),
      h('th', { scope: 'col', class: 'num col-locked-after' }, 'Locked after'),
      h('th', { scope: 'col', class: 'col-source' }, 'Source'))),
    h('tbody', {}, rows.length
      ? rows.map((r) => h('tr', { key: r.key },
        h('td', { class: 't-mono col-time' }, r.time),
        h('td', { class: 't-mono col-type' }, r.type),
        h('td', { class: 'col-asset' }, r.asset),
        h('td', { class: 'num t-mono col-free-change' }, r.freeChange),
        h('td', { class: 'num t-mono col-locked-change' }, r.lockedChange),
        h('td', { class: 'num t-mono col-free-after' }, r.freeAfter),
        h('td', { class: 'num t-mono col-locked-after' }, r.lockedAfter),
        h('td', { class: 'col-source' }, r.source.href ? h('a', { class: 'link', href: r.source.href }, r.source.label) : r.source.label)))
      : h('tr', {}, h('td', { colspan: 8, class: 'ledger-empty' }, empty))));
}
