// WithdrawalQueueTable (section 5; board Admin · Withdrawals): each request
// with when it came and how long it has waited, who sent it and their
// identity check, the amounts, the address (copyable) and the decision.

import { h, cx } from '../../dom.js';
import { StatusMarker } from '../ui/StatusMarker.js';
import { CopyButton } from '../ui/CopyButton.js';

/** vm: the withdrawals presenter's vm; askApprove(id), startReject(id). */
export function WithdrawalQueueTable(vm, { askApprove, startReject }) {
  const pending = vm.tab === 'pending';
  const completed = vm.tab === 'completed';
  return h('table', { class: 'table withdrawals-table' },
    h('caption', { class: 'sr-only' }, pending ? 'Withdrawals waiting, oldest first' : `${completed ? 'Completed' : 'Rejected'} withdrawals, newest first`),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', class: 'col-requested' }, 'Requested'),
      h('th', { scope: 'col', class: 'col-user' }, 'User'),
      h('th', { scope: 'col', class: 'col-asset' }, 'Asset'),
      h('th', { scope: 'col', class: 'num col-amount' }, 'Amount'),
      h('th', { scope: 'col', class: 'num col-fee' }, 'Fee'),
      h('th', { scope: 'col', class: 'num col-receive' }, 'They receive'),
      h('th', { scope: 'col', class: 'col-address' }, 'To address'),
      h('th', { scope: 'col', class: 'num col-decision' }, pending ? 'Decision' : completed ? 'Sent' : 'Rejected'))),
    h('tbody', {}, vm.rows.length
      ? vm.rows.map((r) => h('tr', { key: r.key },
        h('td', { class: 'col-requested' },
          h('span', { class: 't-mono' }, r.requested),
          r.waited ? h('span', { class: cx('wd-sub', { 'queue-wait-oldest': r.oldest }) }, r.waited) : null),
        h('th', { scope: 'row', class: 'col-user' },
          h('span', {}, r.user),
          StatusMarker(r.kyc, { size: 'sm', className: 'wd-kyc' })),
        h('td', { class: 'wd-asset' }, r.asset),
        h('td', { class: 'num t-mono' }, r.amount),
        h('td', { class: 'num t-mono' }, r.fee),
        h('td', { class: 'num t-mono wd-receive' }, r.receive),
        h('td', { class: 'col-address' },
          h('span', { class: 't-mono' }, r.address),
          r.addressFull ? CopyButton({ value: r.addressFull, iconOnly: true, label: 'Copy the address' }) : null),
        pending
          ? h('td', { class: 'num col-decision' },
            h('div', { class: 'wd-actions' },
              h('button', { type: 'button', class: 'btn btn-buy btn-sm', disabled: r.busy, 'aria-label': `Approve ${r.user}'s withdrawal`, onClick: () => askApprove(r.key) }, 'Approve'),
              h('button', { type: 'button', class: 'btn btn-danger-outline btn-sm', disabled: r.busy, 'aria-label': `Reject ${r.user}'s withdrawal`, onClick: () => startReject(r.key) }, 'Reject')))
          : h('td', { class: 'num col-decision' },
            h('span', { class: 't-mono' }, r.decided ?? '—'),
            completed
              ? (r.hash ? h('span', { class: 'wd-sub t-mono', title: r.hashFull }, r.hash) : null)
              : (r.reason ? h('span', { class: 'wd-sub wd-reason' }, r.reason) : null))))
      : h('tr', {}, h('td', { colspan: 8, class: 'wd-empty' }, vm.empty))));
}
