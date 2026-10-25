// TradePage (section 5; boards Trade and Trade · phone). On a wide screen:
// the market bar, then the chart over your orders, the price ladder, and the
// ticket over the tape, filling the window. Below 768 px: the price, Chart,
// Book and Trades tabs, a short order list, and a Buy and Sell bar that opens
// the ticket in a sheet. The market switcher sits in the header there.

import { h, render } from '../../dom.js';
import { createTradePresenter, tradeTitle } from '/src/presenters/trade/trade.presenter.js';
import { Icon } from '../../components/ui/Icon.js';
import { Tabs } from '../../components/ui/Tabs.js';
import { Modal } from '../../components/ui/Overlay.js';
import { MarketStatusBanner } from '../../components/trade/MarketStatusBanner.js';
import { MarketHeader, HeaderMarketSwitch } from '../../components/trade/MarketHeader.js';
import { PriceChart, ChartToolbar } from '../../components/charts/PriceChart.js';
import { OrderBook } from '../../components/trade/OrderBook.js';
import { RecentTrades } from '../../components/trade/RecentTrades.js';
import { OrderForm, LoginToTradeCTA } from '../../components/trade/OrderForm.js';
import { MyOrdersPanel } from '../../components/trade/MyOrdersPanel.js';
import { PriceChange } from '../../components/market/PriceChange.js';

export const styles = ['/styles/components/ladder.css', '/styles/components/chart.css', '/styles/components/orders.css', '/styles/pages/trade.css'];
export const title = (ctx) => tradeTitle(ctx.params.symbol);

const PHONE = '(max-width: 767px)';

function Waiting(text) {
  return h('div', { class: 'panel-state', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), text);
}

function Failed(text, onRetry) {
  return h('div', { class: 'panel-state' }, h('p', {}, text), h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: onRetry }, 'Try again'));
}

function ChartPanel(vm, actions, { phone, tab = false }) {
  return h('section', {
    class: 'panel chart-panel', id: 'trade-chart', 'aria-labelledby': tab ? 'trade-tab-chart' : 'chart-title', role: tab ? 'tabpanel' : null,
  },
  h('div', { class: 'panel-head chart-head' },
    phone ? null : h('h2', { class: 'panel-label', id: 'chart-title' }, 'Price'),
    ChartToolbar(vm.chart, actions.chart, { readout: !phone })),
  PriceChart(vm.chart, actions.chart));
}

function GroupSelect(book, actions) {
  return h('div', { class: 'ladder-group' },
    h('label', { class: 'ladder-group-label', for: 'ladder-group' }, 'Group'),
    h('div', { class: 'select-wrap ladder-group-wrap' },
      h('select', { id: 'ladder-group', class: 'select ladder-group-select t-mono', value: book.group, onChange: (e) => actions.setGroup(e.target.value) },
        book.groups.map((g) => h('option', { value: g.value }, g.label))),
      Icon('chevron-down', { size: 14, className: 'select-chevron' })));
}

function LadderPanel(vm, actions, { onPick, tab = false }) {
  const book = vm.book;
  let body;
  if (book.status === 'ready') body = OrderBook(book, { onPick, caption: book.caption, className: 'ladder-full' });
  else if (book.status === 'error') body = Failed(book.error, actions.book.retry);
  else if (book.status === 'empty') body = h('div', { class: 'panel-state' }, h('p', {}, book.empty));
  else body = Waiting('Loading the order book…');
  return h('section', {
    class: 'panel ladder-panel', id: 'trade-book', 'aria-labelledby': tab ? 'trade-tab-book' : 'ladder-title', role: tab ? 'tabpanel' : null,
  },
  h('div', { class: 'panel-head' },
    h('h2', { class: 'panel-label', id: 'ladder-title' }, 'Price ladder'),
    book.groups ? GroupSelect(book, actions.book) : null),
  body);
}

function TapePanel(vm, actions, { tab = false, base }) {
  return h('section', {
    class: 'panel tape-panel', id: 'trade-trades', 'aria-labelledby': tab ? 'trade-tab-trades' : 'tape-title', role: tab ? 'tabpanel' : null,
  },
  h('div', { class: 'panel-head' },
    h('h2', { class: 'panel-label', id: 'tape-title' }, 'Tape'),
    h('p', { class: 'tape-hint' }, 'colour = taker side')),
  h('div', { class: 'tape-body' }, RecentTrades(vm.trades, { base, onRetry: actions.trades.retry })));
}

function Ticket(vm, actions, idPrefix) {
  const form = vm.form;
  if (form.status === 'guest') return LoginToTradeCTA(form);
  if (form.status !== 'ready') return Waiting('Loading…');
  return OrderForm(form, actions.form, { idPrefix });
}

function Desk(vm, actions, base) {
  return h('div', { class: 'trade-grid' },
    h('div', { class: 'trade-col trade-col-main' },
      ChartPanel(vm, actions, { phone: false }),
      MyOrdersPanel(vm.myOrders, actions.myOrders)),
    LadderPanel(vm, actions, { onPick: actions.book.pick }),
    h('div', { class: 'trade-col trade-col-side' },
      h('section', { class: 'panel ticket-panel', 'aria-labelledby': 'ticket-title' },
        h('h2', { class: 'panel-label ticket-title', id: 'ticket-title' }, 'Order ticket'),
        Ticket(vm, actions, 'ticket')),
      TapePanel(vm, actions, { base })));
}

function Phone(vm, actions, base) {
  const header = vm.header;
  // A ladder price on a phone also opens the ticket with it.
  const onPick = (price) => {
    actions.book.pick(price);
    if (vm.signedIn) actions.openTicket();
  };
  let panel;
  if (vm.tab === 'book') panel = LadderPanel(vm, actions, { onPick, tab: true });
  else if (vm.tab === 'trades') panel = TapePanel(vm, actions, { tab: true, base });
  else panel = ChartPanel(vm, actions, { phone: true, tab: true });

  return h('div', { class: 'trade-phone' },
    h('div', { class: 'phone-price' },
      h('h1', { class: 'sr-only', id: 'market-title' }, header.pair),
      h('p', { class: 'phone-last' }, h('span', { class: 't-mono phone-last-price' }, h('span', { class: 'sr-only' }, `${header.pair} last price `), header.last), PriceChange(header.change)),
      h('p', { class: 'phone-summary t-mono' }, header.summary)),
    h('div', { class: 'phone-body' },
      Tabs({
        items: vm.tabs.map((t) => ({ ...t, id: `trade-tab-${t.key}` })),
        onSelect: actions.setTab,
        label: 'Chart, book or trades',
        className: 'tabs-large phone-tabs',
      }),
      panel,
      MyOrdersPanel(vm.myOrders, actions.myOrders, { phone: true })),
    h('div', { class: 'phone-bar' },
      vm.freeToTrade ? h('p', { class: 'phone-free' }, h('span', {}, 'Free to trade'), h('span', { class: 't-mono' }, vm.freeToTrade)) : null,
      vm.signedIn
        ? h('div', { class: 'phone-actions' },
          h('button', { type: 'button', class: 'btn btn-buy btn-lg', disabled: vm.halted, onClick: () => actions.openTicket('buy') }, 'Buy'),
          h('button', { type: 'button', class: 'btn btn-sell btn-lg', disabled: vm.halted, onClick: () => actions.openTicket('sell') }, 'Sell'))
        : h('div', { class: 'phone-actions' }, h('a', { class: 'btn btn-primary btn-lg', href: `/login?next=${encodeURIComponent(`/trade/${vm.symbol}`)}` }, 'Log in to trade'))),
    vm.sheet.open
      ? Modal({ title: vm.sheet.title, titleId: 'ticket-sheet-title', onClose: actions.closeTicket, className: 'ticket-sheet', closeLabel: 'Close the ticket' },
        h('div', { class: 'dialog-body' }, Ticket(vm, actions, 'sheet')))
      : null);
}

function TradeView(vm, actions, ui) {
  if (vm.status === 'loading') return h('div', { class: 'trade-page' }, Waiting('Loading the market…'));
  if (vm.status === 'error') return h('div', { class: 'trade-page' }, Failed('The markets didn\'t load.', actions.retry));
  if (vm.status === 'missing') {
    return h('div', { class: 'container page trade-missing' },
      h('h1', { class: 't-title' }, `There's no ${vm.pair} market`),
      h('p', {}, 'It may have been delisted, or the address is mistyped.'),
      h('a', { class: 'btn btn-primary', href: '/markets' }, 'See all markets'));
  }
  return h('div', { class: 'trade-page' },
    MarketStatusBanner(vm.banner),
    ui.phone ? Phone(vm, actions, vm.base) : [MarketHeader(vm.header, actions.header), Desk(vm, actions, vm.base)]);
}

export function mount(outlet, route, layout) {
  const presenter = createTradePresenter(route.params.symbol);
  const query = matchMedia(PHONE);
  const draw = () => {
    const vm = presenter.vm;
    render(outlet, TradeView(vm, presenter.actions, { phone: query.matches }));
    const center = layout?.headerCenter?.();
    if (center) render(center, vm.status === 'ready' && query.matches ? HeaderMarketSwitch(vm.header, presenter.actions.header) : null);
  };
  draw();
  const off = presenter.subscribe(draw);
  query.addEventListener('change', draw);
  return () => {
    off();
    query.removeEventListener('change', draw);
    presenter.dispose();
    const center = layout?.headerCenter?.();
    if (center) render(center);
    render(outlet);
  };
}
