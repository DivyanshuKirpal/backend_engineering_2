// TransactionsPage (section 5; board History · Ledger tab): Deposits,
// Withdrawals and Ledger tabs (?tab=), the ledger's asset and entry filters,
// and "Load older entries".

import { h, render } from '../../dom.js';
import { createTransactionsPresenter } from '/src/presenters/wallet/transactions.presenter.js';
import { Tabs } from '../../components/ui/Tabs.js';
import { Select } from '../../components/ui/Field.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { LedgerHistoryTable } from '../../components/wallet/LedgerTable.js';
import { TransactionTable } from '../../components/wallet/TransactionTable.js';

export const styles = ['/styles/pages/history.css'];
export const title = () => 'History';

function Foot({ text, hasMore, loadingMore, onMore, label }) {
  return h('div', { class: 'history-foot' },
    h('p', {}, text),
    hasMore ? h('button', { type: 'button', class: 'btn btn-secondary btn-md', disabled: loadingMore, onClick: onMore }, loadingMore ? 'Loading…' : label) : null);
}

function HistoryView(vm, actions) {
  let body;
  const data = vm.ledger ?? vm.list;
  if (data.status === 'error') body = ErrorState({ title: 'This list didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  else if (data.status !== 'ready') body = Skeleton({ lines: 8, label: 'Loading' });
  else if (vm.ledger) {
    body = [
      h('div', { class: 'table-wrap' }, LedgerHistoryTable({ rows: vm.ledger.rows, empty: vm.ledger.empty })),
      Foot({
        text: `Each row shows your balance right after the change, so any number in your wallet can be traced back to the entries that made it. ${vm.ledger.summary}`,
        hasMore: vm.ledger.hasMore, loadingMore: vm.ledger.loadingMore, onMore: actions.loadMore, label: 'Load older entries',
      }),
    ];
  } else {
    body = [
      h('div', { class: 'table-wrap' }, TransactionTable(vm.list, { onCancel: actions.cancelWithdrawal })),
      Foot({
        text: vm.list.kind === 'deposits' ? 'Simulated deposits land at once. Card deposits arrive with the backend.' : 'An admin approves or rejects each withdrawal; a pending one can still be cancelled.',
        hasMore: vm.list.hasMore, loadingMore: vm.list.loadingMore, onMore: actions.loadMore, label: 'Load older',
      }),
      h('p', { class: 'undesigned-note history-note' }, 'Not drawn yet: this tab\'s table follows the Ledger tab.'),
    ];
  }

  return h('div', { class: 'container page history-page' },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { class: 'link', href: '/wallet' }, 'Wallet'), h('span', { class: 'crumbs-sep', 'aria-hidden': 'true' }, '/'), h('span', { 'aria-current': 'page' }, 'History')),
    h('div', { class: 'page-head' },
      h('h1', { class: 't-title' }, 'History'),
      h('p', {}, 'Deposits, withdrawals, and every ledger entry behind your balances.')),
    h('div', { class: 'history-tools' },
      Tabs({ items: vm.tabs, onSelect: actions.setTab, label: 'History' }),
      vm.ledger
        ? h('div', { class: 'history-filters' },
          Select({ id: 'ledger-asset', label: 'Asset', value: vm.ledger.filters.asset, options: vm.ledger.filters.assetOptions, onChange: actions.setAsset, inline: true }),
          Select({ id: 'ledger-group', label: 'Entry', value: vm.ledger.filters.group, options: vm.ledger.filters.groupOptions, onChange: actions.setGroup, inline: true }))
        : null),
    h('section', { class: 'panel history-panel', id: 'history-panel', role: 'tabpanel', 'aria-label': vm.tabs.find((t) => t.current).label }, body));
}

export function mount(outlet, route) {
  const presenter = createTransactionsPresenter({ tab: route.query.tab, asset: route.query.asset, group: route.query.group });
  const draw = () => render(outlet, HistoryView(presenter.vm, presenter.actions));
  draw();
  const off = presenter.subscribe(draw);
  return {
    update: (ctx) => presenter.actions.syncTab(ctx.query.tab),
    unmount() {
      off();
      presenter.dispose();
      render(outlet);
    },
  };
}
