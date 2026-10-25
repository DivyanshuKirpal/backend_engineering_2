// MarketsPage (section 5; board Markets).

import { h } from '../../dom.js';
import { mountView } from '../../mountView.js';
import { createMarketsPresenter } from '/src/presenters/market/markets.presenter.js';
import { Tabs } from '../../components/ui/Tabs.js';
import { SearchInput } from '../../components/ui/Field.js';
import { EmptyState, Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { MarketTable } from '../../components/market/MarketTable.js';

export const styles = ['/styles/pages/markets.css'];
export const title = () => 'Markets';

function MarketsView(vm, actions) {
  let body;
  if (vm.status === 'error') body = ErrorState({ title: 'The markets didn\'t load', body: vm.error, onRetry: actions.retry });
  else if (vm.status !== 'ready') body = Skeleton({ lines: 5, label: 'Loading the markets' });
  else if (vm.empty) {
    body = EmptyState({
      title: vm.empty.title,
      body: vm.empty.body,
      action: vm.empty.action ? h('a', { class: 'btn btn-primary btn-sm', href: vm.empty.action.href }, vm.empty.action.label) : null,
    });
  } else body = MarketTable(vm, actions);

  return h('div', { class: 'container page markets-page' },
    h('div', { class: 'page-head' },
      h('h1', { class: 't-title' }, 'Markets'),
      h('p', {}, 'Four spot markets, all priced in USDT. Prices update live.')),
    h('div', { class: 'markets-tools' },
      Tabs({ label: 'Filter markets', items: vm.tabs, onSelect: actions.setTab, className: 'markets-tabs' }),
      SearchInput({ id: 'market-search', label: 'Search markets', value: vm.query, placeholder: 'Search by name or code', onInput: actions.setQuery })),
    h('section', { class: 'panel markets-panel', 'aria-label': 'Markets' }, body),
    h('div', { class: 'markets-foot' },
      vm.footnote ? h('p', { class: 'markets-note' }, vm.footnote) : h('span'),
      h('a', { class: 'link', href: '/fees' }, 'Fees, tick sizes and minimum orders')));
}

export function mount(outlet) {
  return mountView(outlet, createMarketsPresenter(), MarketsView);
}
