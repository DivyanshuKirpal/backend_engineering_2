// OrdersPage (section 5; board Orders · detail drawer open): Open, History and
// Trades tabs (?tab=) across every market, the market and side filters,
// Cancel all with a confirmation, and the order drawer (?order=).

import { h, render } from '../../dom.js';
import { createOrdersPresenter } from '/src/presenters/orders/orders.presenter.js';
import { Tabs } from '../../components/ui/Tabs.js';
import { ConfirmDialog } from '../../components/ui/Overlay.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { OrderFilters } from '../../components/orders/OrderFilters.js';
import { OpenOrdersTable, OrderHistoryTable, TradeHistoryTable } from '../../components/orders/OrderTables.js';
import { OrderDetailDrawer } from '../../components/orders/OrderDetailDrawer.js';

export const styles = ['/styles/components/orders.css', '/styles/pages/orders.css'];
export const title = () => 'Orders';

function Foot({ text, hasMore, loadingMore, onMore }) {
  return h('div', { class: 'orders-foot' },
    h('p', {}, text),
    hasMore ? h('button', { type: 'button', class: 'btn btn-secondary', disabled: loadingMore, onClick: onMore }, loadingMore ? 'Loading…' : 'Load older') : null);
}

function Body(vm, actions) {
  const data = vm.open ?? vm.history ?? vm.trades;
  if (data.status === 'error') return ErrorState({ title: 'Your orders didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  if (data.status !== 'ready') return Skeleton({ lines: 6, label: 'Loading your orders' });
  if (vm.open) return h('div', { class: 'table-wrap' }, OpenOrdersTable(vm.open, { onCancel: actions.cancel }));
  const history = Boolean(vm.history);
  return [
    h('div', { class: 'table-wrap' }, history ? OrderHistoryTable(vm.history) : TradeHistoryTable(vm.trades)),
    Foot({
      text: history ? 'Filled, cancelled and rejected orders, newest first.' : 'Every fill of your orders, newest first. A fee is charged on what you receive.',
      hasMore: data.hasMore,
      loadingMore: data.loadingMore,
      onMore: actions.loadMore,
    }),
  ];
}

function OrdersView(vm, actions) {
  return h('div', { class: 'container page orders-page' },
    h('div', { class: 'page-head' },
      h('h1', { class: 't-title' }, 'Orders'),
      h('p', {}, 'Every order you\'ve placed, across all four markets.')),
    h('div', { class: 'orders-tools' },
      Tabs({ items: vm.tabs, onSelect: actions.setTab, label: 'Orders' }),
      h('div', { class: 'orders-actions' },
        OrderFilters(vm.filters, { onMarket: actions.setMarket, onSide: actions.setSide }),
        vm.cancelAll
          ? h('button', { type: 'button', class: 'btn btn-quiet cancel-all', disabled: vm.cancelAll.disabled, onClick: actions.askCancelAll }, 'Cancel all')
          : null)),
    h('section', { class: 'panel orders-panel', id: 'orders-panel', role: 'tabpanel', 'aria-label': vm.tabs.find((t) => t.current).label }, Body(vm, actions)),
    vm.open
      ? h('p', { class: 'orders-note' }, 'Pending means the API has accepted the order and the matching engine hasn\'t queued it yet. It usually takes a fraction of a second.')
      : h('p', { class: 'undesigned-note orders-note' }, 'Not drawn yet: this tab\'s table follows the Open tab.'),
    vm.drawer ? OrderDetailDrawer(vm.drawer, { onClose: actions.closeDrawer, onCancel: () => actions.cancel(vm.drawer.key), onRetry: actions.retryDrawer }) : null,
    vm.confirm
      ? ConfirmDialog({
        title: vm.confirm.title,
        titleId: 'cancel-all-title',
        body: vm.confirm.body,
        confirmLabel: vm.confirm.confirmLabel,
        cancelLabel: vm.confirm.cancelLabel,
        tone: 'danger',
        busy: vm.confirm.busy,
        onConfirm: actions.confirmCancelAll,
        onCancel: actions.dismissCancelAll,
      })
      : null);
}

export function mount(outlet, route) {
  const presenter = createOrdersPresenter(route.query);
  const draw = () => render(outlet, OrdersView(presenter.vm, presenter.actions));
  draw();
  const off = presenter.subscribe(draw);
  return {
    update: (ctx) => presenter.actions.sync(ctx.query),
    unmount() {
      off();
      presenter.dispose();
      render(outlet);
    },
  };
}
