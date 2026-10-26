// FeesPage (section 5): what trading and withdrawing cost, market by market
// and asset by asset. Not drawn yet: built from the wallet's fee tables.

import { h, render } from '../../dom.js';
import { createFeesPresenter } from '/src/presenters/info/fees.presenter.js';
import { AssetIcon } from '../../components/market/AssetIcon.js';
import { StatusMarker } from '../../components/ui/StatusMarker.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';

export const styles = ['/styles/pages/info.css'];
export const title = () => 'Fees';

function TradingFees(rows) {
  return h('section', { class: 'panel info-panel', 'aria-labelledby': 'trading-fees' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-label', id: 'trading-fees' }, 'Trading')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table info-table' },
      h('caption', { class: 'sr-only' }, 'Fees and limits per market'),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Market'),
        h('th', { scope: 'col', class: 'num' }, 'Maker'),
        h('th', { scope: 'col', class: 'num' }, 'Taker'),
        h('th', { scope: 'col', class: 'num' }, 'Smallest order'),
        h('th', { scope: 'col', class: 'num' }, 'Smallest amount'),
        h('th', { scope: 'col', class: 'num' }, 'Price step'),
        h('th', { scope: 'col' }, 'Status'))),
      h('tbody', {}, rows.map((r) => h('tr', { key: r.key },
        h('th', { scope: 'row' }, h('span', { class: 'info-asset' }, AssetIcon(r.icon, { size: 'sm' }), r.market)),
        h('td', { class: 'num t-mono' }, r.maker),
        h('td', { class: 'num t-mono' }, r.taker),
        h('td', { class: 'num t-mono' }, r.minOrder),
        h('td', { class: 'num t-mono' }, r.minQty),
        h('td', { class: 'num t-mono' }, r.tick),
        h('td', {}, StatusMarker(r.status, { size: 'sm' }))))))));
}

function FundingFees(rows) {
  return h('section', { class: 'panel info-panel', 'aria-labelledby': 'funding-fees' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-label', id: 'funding-fees' }, 'Deposits and withdrawals')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table info-table' },
      h('caption', { class: 'sr-only' }, 'Deposit and withdrawal fees per asset'),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Asset'),
        h('th', { scope: 'col' }, 'Deposits'),
        h('th', { scope: 'col', class: 'num' }, 'Withdrawal fee'),
        h('th', { scope: 'col', class: 'num' }, 'Smallest withdrawal'))),
      h('tbody', {}, rows.map((r) => h('tr', { key: r.key },
        h('th', { scope: 'row' }, h('span', { class: 'info-asset' }, AssetIcon(r.icon, { size: 'sm' }), r.code, h('span', { class: 'info-name' }, r.name))),
        h('td', {}, r.deposit),
        h('td', { class: 'num t-mono' }, r.fee),
        h('td', { class: 'num t-mono' }, r.min)))))));
}

function FeesView(vm, actions) {
  let body;
  if (vm.status === 'error') body = ErrorState({ title: 'The fees didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  else if (vm.status !== 'ready') body = Skeleton({ lines: 8, label: 'Loading the fees' });
  else {
    body = [
      TradingFees(vm.markets),
      h('div', { class: 'info-notes' },
        h('p', {}, h('strong', {}, 'Maker or taker. '), 'An order that waits on the book pays the maker rate when something fills it; an order that fills against the book on arrival pays the taker rate. A market order is always the taker.'),
        h('p', {}, h('strong', {}, 'Taken from what you receive. '), 'Buy BTC and the fee comes out of the BTC; sell it and the fee comes out of the USDT. Every fill writes the fee to your ledger as its own line.')),
      FundingFees(vm.assets),
      h('p', { class: 'info-foot' }, 'All of it is demo money: no fee here is ever paid in anything real. A fee change applies to new trades only.'),
    ];
  }
  return h('div', { class: 'container page info-page fees-page' },
    h('div', { class: 'page-head' },
      h('h1', { class: 't-title' }, 'Fees'),
      h('p', {}, 'What each trade and each withdrawal costs. Deposits are free.')),
    body,
    h('p', { class: 'undesigned-note' }, 'Not drawn yet: built from the wallet\'s fee tables.'));
}

export function mount(outlet) {
  const presenter = createFeesPresenter();
  const draw = () => render(outlet, FeesView(presenter.vm, presenter.actions));
  draw();
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    render(outlet);
  };
}
