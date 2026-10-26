// DepositPage (section 5; board Deposit): the asset and method, the simulated
// address with its QR code, the simulated deposit form, and beside them the
// recent deposits and the most per deposit. ?asset= picks the asset.

import { h, render } from '../../dom.js';
import { createDepositPresenter } from '/src/presenters/wallet/deposit.presenter.js';
import { Tabs } from '../../components/ui/Tabs.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { AssetSelect, DepositAddressCard, SimulateDepositForm, RecentTransactions, LimitsTable } from '../../components/wallet/FundsParts.js';

export const styles = ['/styles/pages/funds.css'];
export const title = () => 'Deposit';

function CardDeposit() {
  return h('div', { class: 'funds-section card-deposit' },
    h('h2', { class: 'funds-title' }, 'Card deposit'),
    h('p', {}, 'Card deposits buy USDT through Stripe in test mode, and the credit arrives when Stripe calls the server back. That needs the backend, so this tab waits for it. Use a simulated deposit meanwhile.'),
    h('p', { class: 'undesigned-note' }, 'Not built yet: card deposits (Stretch).'));
}

function DepositView(vm, actions) {
  let main;
  if (vm.status === 'error') main = ErrorState({ title: 'This page didn\'t load', body: 'The asset list is missing.', onRetry: actions.retry });
  else if (vm.status !== 'ready') main = Skeleton({ lines: 6, label: 'Loading' });
  else {
    main = h('div', { class: 'funds-grid' },
      h('section', { class: 'panel funds-card', 'aria-label': `Deposit ${vm.code}` },
        h('div', { class: 'funds-section funds-pick' },
          AssetSelect({ id: 'deposit-asset', label: 'Asset', value: vm.code, options: vm.options, tile: vm.tile, onChange: actions.pick }),
          Tabs({
            items: vm.methods.map((m) => ({ ...m, label: m.note ? [m.label, h('span', { class: 'tab-note' }, ` · ${m.note}`)] : m.label })),
            onSelect: actions.setMethod,
            label: 'How to deposit',
            className: 'deposit-methods',
          })),
        vm.method === 'card' ? CardDeposit() : [DepositAddressCard(vm), SimulateDepositForm(vm.form, actions)]),
      h('div', { class: 'funds-side' },
        RecentTransactions({
          id: 'recent-deposits', title: 'Recent deposits', href: '/wallet/history?tab=deposits', list: vm.recent,
          empty: 'No deposits yet.',
          note: 'Your 10,000 USDT sign-up credit is on the ledger, not listed here.',
        }),
        LimitsTable({ id: 'deposit-limits', title: 'Most per deposit', cells: vm.limits.map((l) => ({ key: l.key, code: l.code, value: l.limit })) })));
  }
  return h('div', { class: 'container page funds-page' },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { class: 'link', href: '/wallet' }, 'Wallet'), h('span', { class: 'crumbs-sep', 'aria-hidden': 'true' }, '/'), h('span', { 'aria-current': 'page' }, 'Deposit')),
    h('div', { class: 'page-head' },
      h('h1', { class: 't-title' }, 'Deposit'),
      h('p', {}, 'Add demo funds to your wallet. Nothing on this page touches a real blockchain.')),
    main);
}

export function mount(outlet, route) {
  const presenter = createDepositPresenter({ asset: route.query.asset });
  const draw = () => render(outlet, DepositView(presenter.vm, presenter.actions));
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
