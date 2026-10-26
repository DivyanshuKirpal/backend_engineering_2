// WithdrawPage (section 5; board Withdraw): the form, or the way to KYC until
// it is approved; beside it the identity check, pending withdrawals (each with
// Cancel) and the fees and minimums. ?asset= picks the asset.

import { h, render } from '../../dom.js';
import { createWithdrawPresenter } from '/src/presenters/wallet/withdraw.presenter.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { ConfirmDialog } from '../../components/ui/Overlay.js';
import { KycRequiredNotice } from '../../components/wallet/KycRequiredNotice.js';
import { KycStatusCard } from '../../components/account/KycStatusCard.js';
import { WithdrawForm } from '../../components/wallet/WithdrawForm.js';
import { RecentTransactions, FeesTable } from '../../components/wallet/FundsParts.js';

export const styles = ['/styles/pages/funds.css'];
export const title = () => 'Withdraw';

function WithdrawView(vm, actions) {
  let main;
  if (vm.status === 'error') main = ErrorState({ title: 'This page didn\'t load', body: 'The asset list is missing.', onRetry: () => location.reload() });
  else if (vm.status !== 'ready') main = Skeleton({ lines: 6, label: 'Loading' });
  else {
    const pending = vm.pending.status === 'ready'
      ? {
        ...vm.pending,
        rows: vm.pending.rows.map((r) => ({
          ...r,
          action: h('button', { type: 'button', class: 'link', disabled: r.cancelling, onClick: () => actions.cancelPending(r.key) }, r.cancelling ? 'Cancelling…' : 'Cancel'),
        })),
      }
      : vm.pending;
    main = h('div', { class: 'funds-grid' },
      h('section', { class: 'panel funds-card', 'aria-label': 'Withdrawal' },
        vm.approved ? WithdrawForm(vm, actions) : h('div', { class: 'funds-section' }, KycRequiredNotice(vm.kycNotice))),
      h('div', { class: 'funds-side' },
        vm.kycCard ? KycStatusCard(vm.kycCard) : null,
        RecentTransactions({
          id: 'pending-withdrawals', title: 'Pending withdrawals', href: '/wallet/history?tab=withdrawals', list: pending,
          empty: 'Nothing waiting for review. Requests show here until an admin decides.',
        }),
        FeesTable({ id: 'withdraw-fees', title: 'Fees and minimums', rows: vm.fees })),
      vm.confirm
        ? ConfirmDialog({
          title: vm.confirm.title,
          titleId: 'withdraw-confirm-title',
          body: vm.confirm.body,
          confirmLabel: 'Request withdrawal',
          cancelLabel: 'Go back',
          busy: vm.confirm.busy,
          onConfirm: actions.confirm,
          onCancel: actions.cancelConfirm,
        })
        : null);
  }
  return h('div', { class: 'container page funds-page' },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { class: 'link', href: '/wallet' }, 'Wallet'), h('span', { class: 'crumbs-sep', 'aria-hidden': 'true' }, '/'), h('span', { 'aria-current': 'page' }, 'Withdraw')),
    h('div', { class: 'page-head' },
      h('h1', { class: 't-title' }, 'Withdraw'),
      h('p', {}, 'Send demo funds to another simulated address. An admin approves every withdrawal before it leaves.')),
    main);
}

export function mount(outlet, route) {
  const presenter = createWithdrawPresenter({ asset: route.query.asset });
  const draw = () => render(outlet, WithdrawView(presenter.vm, presenter.actions));
  draw();
  const off = presenter.subscribe(draw);
  return {
    update: (ctx) => presenter.actions.syncAsset(ctx.query.asset),
    unmount() {
      off();
      presenter.dispose();
      render(outlet);
    },
  };
}
