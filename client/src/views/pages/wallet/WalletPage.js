// WalletPage (section 5; board Wallet).

import { h } from '../../dom.js';
import { mountView } from '../../mountView.js';
import { createWalletPresenter } from '/src/presenters/wallet/wallet.presenter.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { BalanceOverviewCard } from '../../components/wallet/BalanceOverviewCard.js';
import { AllocationBar } from '../../components/charts/AllocationBar.js';
import { AssetBalanceTable } from '../../components/wallet/AssetBalanceTable.js';

export const styles = ['/styles/pages/wallet.css'];
export const title = () => 'Wallet';

function WalletView(vm, actions) {
  let body;
  if (vm.status === 'error') body = ErrorState({ title: 'The wallet didn\'t load', body: vm.error, onRetry: actions.retry });
  else if (vm.status !== 'ready') body = Skeleton({ lines: 6, label: 'Loading your balances' });
  else {
    body = [
      h('div', { class: 'wallet-top' }, BalanceOverviewCard(vm.overview), AllocationBar(vm.allocation)),
      AssetBalanceTable(vm, actions),
    ];
  }
  return h('div', { class: 'container page wallet-page' },
    h('div', { class: 'page-head wallet-head' },
      h('div', {},
        h('h1', { class: 't-title' }, 'Wallet'),
        h('p', {}, 'Every balance, valued at live prices.')),
      h('div', { class: 'wallet-head-actions' },
        h('a', { class: 'btn btn-primary btn-md', href: '/wallet/deposit' }, 'Deposit'),
        h('a', { class: 'btn btn-secondary btn-md', href: '/wallet/withdraw' }, 'Withdraw'),
        h('a', { class: 'btn btn-quiet-flat history-btn', href: '/wallet/history' }, 'History'))),
    body);
}

export function mount(outlet) {
  return mountView(outlet, createWalletPresenter(), WalletView);
}
