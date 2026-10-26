// OpenOrdersTable, OrderHistoryTable and TradeHistoryTable (section 5): one
// row per order or fill across every market. An order id links to its
// drawer, and the row the drawer shows carries an ink bar.

import { h, cx } from '../../dom.js';
import { StatusMarker } from '../ui/StatusMarker.js';
import { EmptyState } from '../ui/EmptyState.js';

/** [label, class] per column; a null label is a column only screen readers name. */
function Head(columns) {
  return h('thead', {}, h('tr', {}, columns.map(([label, cls]) => h('th', { scope: 'col', class: cls },
    label ?? h('span', { class: 'sr-only' }, 'Actions')))));
}

function EmptyRow(span, empty) {
  const action = empty.action ? h('a', { class: 'btn btn-secondary btn-sm', href: empty.action.href }, empty.action.label) : null;
  return h('tr', {}, h('td', { colspan: span, class: 'table-empty' }, EmptyState({ ...empty, action, className: 'orders-empty' })));
}

function OrderLink(r, what = 'order') {
  return h('a', {
    class: 'link order-link t-mono',
    href: r.href,
    'aria-label': `Open ${what} ${r.id ?? r.order}`,
    'aria-current': r.current ? 'true' : null,
  }, r.id ?? r.order);
}

const SideType = (r) => [h('strong', { class: `side-word tone-${r.tone}` }, r.side), ` · ${r.type}`];

const OPEN_COLUMNS = [
  ['Placed', 'col-placed'], ['Order', 'col-order'], ['Market', 'col-market'], ['Side · type', 'col-side'],
  ['Price', 'num col-price'], ['Amount', 'num col-amount'], ['Filled', 'num col-filled'], ['Total · USDT', 'num col-total'],
  ['Status', 'col-status'], [null, 'col-actions'],
];

/** list: { rows, empty }. onCancel(id) cancels one order. */
export function OpenOrdersTable(list, { onCancel }) {
  return h('table', { class: 'table orders-table orders-open' },
    h('caption', { class: 'sr-only' }, 'Your open orders, newest first'),
    Head(OPEN_COLUMNS),
    h('tbody', {}, list.rows.length
      ? list.rows.map((r) => h('tr', { key: r.key, class: cx({ current: r.current }) },
        h('td', { class: 't-mono col-placed' }, r.placed),
        h('td', { class: 'col-order' }, OrderLink(r)),
        h('td', { class: 'col-market' }, r.market),
        h('td', { class: 'col-side' }, SideType(r)),
        h('td', { class: 'num t-mono' }, r.price),
        h('td', { class: 'num t-mono' }, r.amount),
        h('td', { class: 'num t-mono' }, r.filled),
        h('td', { class: 'num t-mono' }, r.total),
        h('td', { class: 'col-status' }, StatusMarker(r.status)),
        h('td', { class: 'num col-actions' }, h('button', {
          type: 'button',
          class: 'btn btn-quiet btn-sm',
          disabled: r.cancelling,
          'aria-label': r.cancelling ? `Cancelling order ${r.id}` : `Cancel order ${r.id}`,
          onClick: () => onCancel(r.key),
        }, r.cancelling ? 'Cancelling…' : 'Cancel'))))
      : EmptyRow(OPEN_COLUMNS.length, list.empty)));
}

const HISTORY_COLUMNS = [
  ['Placed', 'col-placed'], ['Order', 'col-order'], ['Market', 'col-market'], ['Side · type', 'col-side'],
  ['Price', 'num col-price'], ['Amount', 'num col-amount'], ['Filled', 'num col-filled-qty'], ['Average', 'num col-avg'],
  ['Total · USDT', 'num col-total'], ['Status', 'col-status'],
];

/** list: { rows, empty }. A cancelled or rejected order shows why under its status. */
export function OrderHistoryTable(list) {
  return h('table', { class: 'table orders-table orders-history' },
    h('caption', { class: 'sr-only' }, 'Your closed orders, newest first'),
    Head(HISTORY_COLUMNS),
    h('tbody', {}, list.rows.length
      ? list.rows.map((r) => h('tr', { key: r.key, class: cx({ current: r.current }) },
        h('td', { class: 't-mono col-placed' }, r.placed),
        h('td', { class: 'col-order' }, OrderLink(r)),
        h('td', { class: 'col-market' }, r.market),
        h('td', { class: 'col-side' }, SideType(r)),
        h('td', { class: 'num t-mono' }, r.price),
        h('td', { class: 'num t-mono' }, r.amount),
        h('td', { class: 'num t-mono' }, r.filled),
        h('td', { class: 'num t-mono' }, r.avg),
        h('td', { class: 'num t-mono' }, r.total),
        h('td', { class: 'col-status' }, StatusMarker(r.status), r.reason ? h('span', { class: 'order-reason' }, r.reason) : null)))
      : EmptyRow(HISTORY_COLUMNS.length, list.empty)));
}

const TRADE_COLUMNS = [
  ['Time', 'col-placed'], ['Order', 'col-order'], ['Market', 'col-market'], ['Side', 'col-side'], ['Role', 'col-role'],
  ['Price', 'num col-price'], ['Amount', 'num col-amount'], ['Total · USDT', 'num col-total'], ['Fee', 'num col-fee'],
];

/** list: { rows, empty }: your fills, each with the order it filled. */
export function TradeHistoryTable(list) {
  return h('table', { class: 'table orders-table orders-trades' },
    h('caption', { class: 'sr-only' }, 'Your trades, newest first'),
    Head(TRADE_COLUMNS),
    h('tbody', {}, list.rows.length
      ? list.rows.map((r) => h('tr', { key: r.key, class: cx({ current: r.current }) },
        h('td', { class: 't-mono col-placed' }, r.time),
        h('td', { class: 'col-order' }, OrderLink(r)),
        h('td', { class: 'col-market' }, r.market),
        h('td', { class: 'col-side' }, h('strong', { class: `side-word tone-${r.tone}` }, r.side)),
        h('td', { class: 'col-role' }, r.role),
        h('td', { class: 'num t-mono' }, r.price),
        h('td', { class: 'num t-mono' }, r.amount),
        h('td', { class: 'num t-mono' }, r.total),
        h('td', { class: 'num t-mono' }, r.fee)))
      : EmptyRow(TRADE_COLUMNS.length, list.empty)));
}
