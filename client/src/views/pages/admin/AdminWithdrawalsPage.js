// AdminWithdrawalsPage (section 5; board Admin · Withdrawals): Pending,
// Completed and Rejected in the topbar, the requests in a table, and what
// approving or rejecting writes to the ledger.

import { h, render } from '../../dom.js';
import { createAdminWithdrawalsPresenter } from '/src/presenters/admin/withdrawals.presenter.js';
import { Tabs } from '../../components/ui/Tabs.js';
import { Pagination } from '../../components/ui/Pagination.js';
import { ConfirmDialog } from '../../components/ui/Overlay.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { WithdrawalQueueTable } from '../../components/admin/WithdrawalQueueTable.js';
import { RejectReasonModal } from '../../components/admin/RejectReasonModal.js';

export const styles = ['/styles/pages/admin.css'];
export const title = () => 'Withdrawals';

const REASONS = ['The address looks wrong', 'Unusual for this account', 'Asked by the account holder'];

function Topbar(vm, actions) {
  return [h('h1', { class: 'admin-title' }, 'Withdrawals'), Tabs({ items: vm.tabs, onSelect: actions.setTab, label: 'Withdrawals', className: 'admin-tabs' })];
}

const code = (text) => h('code', { class: 't-mono' }, text);

function WithdrawalsView(vm, actions) {
  let body;
  if (vm.status === 'error') body = ErrorState({ title: 'The withdrawals didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  else if (vm.status !== 'ready') body = Skeleton({ lines: 4, label: 'Loading withdrawals' });
  else {
    body = [
      h('div', { class: 'table-wrap' }, WithdrawalQueueTable(vm, actions)),
      h('div', { class: 'list-foot' },
        h('p', {}, vm.summary),
        Pagination({ pages: vm.pagination.pages, current: vm.pagination.current, onPage: actions.setPage, label: 'Pages of withdrawals' })),
    ];
  }
  return h('div', { class: 'admin-page withdrawals-page' },
    h('section', { class: 'panel withdrawals-panel', id: 'withdrawals-list', role: 'tabpanel', 'aria-label': vm.tabs.find((t) => t.current).label }, body),
    vm.tab === 'pending'
      ? h('div', { class: 'wd-explain' },
        h('section', { class: 'panel wd-card' },
          h('h2', { class: 'tone-buy' }, 'Approve'),
          h('p', {}, 'Completes the transfer, sets a transaction hash and writes ', code('withdrawal'), ' and ', code('withdrawal_fee'), ' entries to the user\'s ledger.')),
        h('section', { class: 'panel wd-card' },
          h('h2', { class: 'tone-sell' }, 'Reject'),
          h('p', {}, 'Asks for a reason the user will see, then unlocks the full amount with a ', code('withdrawal_unlock'), ' entry.')))
      : null,
    vm.confirm
      ? ConfirmDialog({
        title: vm.confirm.title,
        titleId: 'approve-title',
        body: vm.confirm.body,
        confirmLabel: 'Approve',
        cancelLabel: 'Not yet',
        tone: 'buy',
        busy: vm.confirm.busy,
        onConfirm: actions.confirmApprove,
        onCancel: actions.cancelApprove,
      })
      : null,
    vm.reject
      ? RejectReasonModal({ ...vm.reject, title: `Reject ${vm.reject.name}'s withdrawal?`, hint: 'They see this reason, and the full amount goes back to their wallet.', suggestions: REASONS }, {
        onInput: actions.setReason,
        onConfirm: actions.confirmReject,
        onCancel: actions.cancelReject,
      })
      : null);
}

export function mount(outlet, route, layout) {
  const presenter = createAdminWithdrawalsPresenter();
  const top = layout.topbar();
  const draw = () => {
    render(top, ...Topbar(presenter.vm, presenter.actions));
    render(outlet, WithdrawalsView(presenter.vm, presenter.actions));
  };
  draw();
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    render(top);
    render(outlet);
  };
}
