// TransactionTable (section 5): deposits or withdrawals with time, asset,
// amount, status and the address and hash, each copyable. A pending
// withdrawal has Cancel; a rejected one shows the reason.

import { h } from '../../dom.js';
import { CopyButton } from '../ui/CopyButton.js';
import { StatusMarker } from '../ui/StatusMarker.js';

/** list: the transactions presenter's list vm. onCancel(id) for pending withdrawals. */
export function TransactionTable(list, { onCancel } = {}) {
  const withdrawals = list.kind === 'withdrawals';
  const head = withdrawals
    ? ['Time', 'Asset', 'Amount', 'Fee', 'They receive', 'To', 'Status', '']
    : ['Time', 'Asset', 'Amount', 'Method', 'Address', 'Hash', 'Status'];
  const numeric = new Set(['Amount', 'Fee', 'They receive']);
  return h('table', { class: `table transactions-table transactions-${list.kind}` },
    h('caption', { class: 'sr-only' }, withdrawals ? 'Your withdrawals, newest first' : 'Your deposits, newest first'),
    h('thead', {}, h('tr', {}, head.map((label) => h('th', { scope: 'col', class: numeric.has(label) ? 'num' : null }, label || h('span', { class: 'sr-only' }, 'Actions'))))),
    h('tbody', {}, list.rows.length
      ? list.rows.map((r) => h('tr', { key: r.key },
        h('td', { class: 't-mono' }, r.time),
        h('td', {}, r.asset),
        h('td', { class: `num t-mono tone-${r.tone}` }, r.amount),
        withdrawals ? [
          h('td', { class: 'num t-mono' }, r.fee),
          h('td', { class: 'num t-mono' }, r.receive ?? '—'),
          h('td', { class: 't-mono' }, r.addressFull ? [r.address, ' ', CopyButton({ value: r.addressFull, iconOnly: true, label: 'Copy the address' })] : '—'),
          h('td', {}, StatusMarker(r.status), r.reason ? h('span', { class: 'transaction-reason' }, r.reason) : null),
          h('td', { class: 'num' }, r.canCancel ? h('button', { type: 'button', class: 'link', disabled: r.cancelling, onClick: () => onCancel(r.key) }, r.cancelling ? 'Cancelling…' : 'Cancel') : null),
        ] : [
          h('td', {}, r.method),
          h('td', { class: 't-mono' }, r.addressFull ? [r.address, ' ', CopyButton({ value: r.addressFull, iconOnly: true, label: 'Copy the address' })] : '—'),
          h('td', { class: 't-mono' }, r.hashFull ? [r.hash, ' ', CopyButton({ value: r.hashFull, iconOnly: true, label: 'Copy the hash' })] : '—'),
          h('td', {}, StatusMarker(r.status)),
        ]))
      : h('tr', {}, h('td', { colspan: head.length, class: 'transactions-empty' }, list.empty))));
}

/** Deposits and withdrawals together, newest first, read-only (Admin · User). list: { rows, empty }. */
export function AccountTransactionTable(list) {
  const head = [['Time'], ['Type'], ['Asset'], ['Amount', 'num'], ['Fee', 'num'], ['Address'], ['Status']];
  return h('table', { class: 'table transactions-table transactions-account' },
    h('caption', { class: 'sr-only' }, 'Their deposits and withdrawals, newest first'),
    h('thead', {}, h('tr', {}, head.map(([label, cls]) => h('th', { scope: 'col', class: cls }, label)))),
    h('tbody', {}, list.rows.length
      ? list.rows.map((r) => h('tr', { key: r.key },
        h('td', { class: 't-mono' }, r.time),
        h('td', {}, r.type),
        h('td', {}, r.asset),
        h('td', { class: `num t-mono tone-${r.tone}` }, r.amount),
        h('td', { class: 'num t-mono' }, r.fee),
        h('td', { class: 't-mono' }, r.addressFull ? [r.address, ' ', CopyButton({ value: r.addressFull, iconOnly: true, label: 'Copy the address' })] : '—'),
        h('td', {}, StatusMarker(r.status), r.reason ? h('span', { class: 'transaction-reason' }, r.reason) : null)))
      : h('tr', {}, h('td', { colspan: head.length, class: 'transactions-empty' }, list.empty))));
}
