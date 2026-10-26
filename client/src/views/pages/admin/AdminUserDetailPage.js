// AdminUserDetailPage (section 5): one person's account, their money and
// their open orders, with freeze and role changes. Not drawn yet: built from
// the admin pages' panels and the shared tables.

import { h, render } from '../../dom.js';
import { createAdminUserDetailPresenter } from '/src/presenters/admin/userDetail.presenter.js';
import { Panel } from '../../components/ui/Panel.js';
import { ConfirmDialog } from '../../components/ui/Overlay.js';
import { Icon } from '../../components/ui/Icon.js';
import { Skeleton, ErrorState, EmptyState } from '../../components/ui/EmptyState.js';
import { OpenOrdersTable } from '../../components/orders/OrderTables.js';
import { AccountTransactionTable } from '../../components/wallet/TransactionTable.js';
import { UserProfileCard, UserActionsPanel, UserBalancesTable } from '../../components/admin/UserDetail.js';
import { RejectReasonModal } from '../../components/admin/RejectReasonModal.js';

export const styles = ['/styles/pages/admin.css'];
export const title = () => 'User';

const BackLink = () => h('a', { class: 'link user-back', href: '/admin/users' }, Icon('chevron-left', { size: 14 }), 'All users');

function Topbar(vm) {
  if (vm.status !== 'ready') return [h('h1', { class: 'admin-title' }, 'User')];
  return [h('h1', { class: 'admin-title' }, vm.title), h('p', { class: 'admin-subtitle' }, vm.subtitle)];
}

function UserView(vm, actions) {
  let body;
  if (vm.status === 'missing') {
    body = h('section', { class: 'panel' }, EmptyState({
      title: 'There\'s no one with that id',
      body: 'They may never have existed, or the link is mistyped. Bot accounts have no page.',
      action: h('a', { class: 'btn btn-secondary btn-sm', href: '/admin/users' }, 'Back to users'),
      className: 'user-missing',
    }));
  } else if (vm.status === 'error') {
    body = ErrorState({ title: 'This person didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  } else if (vm.status !== 'ready') {
    body = Skeleton({ lines: 8, label: 'Loading this person' });
  } else {
    body = [
      h('div', { class: 'user-detail-top' },
        UserProfileCard(vm.profile),
        UserActionsPanel(vm.actions, actions)),
      Panel({ label: 'Balances', labelId: 'user-balances-title', className: 'user-section', flush: true },
        h('div', { class: 'table-wrap' }, UserBalancesTable(vm.balances))),
      Panel({ label: vm.openOrders.label, labelId: 'user-orders-title', className: 'user-section', flush: true },
        vm.openOrders.rows.length
          ? h('div', { class: 'table-wrap' }, OpenOrdersTable(vm.openOrders, { readOnly: true, caption: 'Their open orders, newest first' }))
          : EmptyState({ ...vm.openOrders.empty, className: 'orders-empty' })),
      Panel({ label: 'Deposits and withdrawals', labelId: 'user-transactions-title', className: 'user-section', flush: true },
        h('div', { class: 'table-wrap' }, AccountTransactionTable(vm.transactions))),
      h('p', { class: 'undesigned-note' }, 'Not drawn yet: built from the admin pages\' panels and the shared tables.'),
    ];
  }
  return h('div', { class: 'admin-page user-detail' },
    BackLink(),
    body,
    vm.reasonDialog
      ? RejectReasonModal(vm.reasonDialog, { onInput: actions.setReason, onConfirm: actions.confirmStatusChange, onCancel: actions.cancelStatusChange })
      : null,
    vm.roleDialog
      ? ConfirmDialog({
        title: vm.roleDialog.title,
        titleId: 'role-title',
        body: vm.roleDialog.body,
        confirmLabel: vm.roleDialog.confirmLabel,
        cancelLabel: 'Not now',
        busy: vm.roleDialog.busy,
        onConfirm: actions.confirmRoleChange,
        onCancel: actions.cancelRoleChange,
      })
      : null);
}

export function mount(outlet, route, layout) {
  const presenter = createAdminUserDetailPresenter({ id: route.params.id });
  const top = layout.topbar();
  const draw = () => {
    const { vm } = presenter;
    render(top, ...Topbar(vm));
    render(outlet, UserView(vm, presenter.actions));
    if (vm.status === 'ready') document.title = `${vm.title} · Users · Orichal`;
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
