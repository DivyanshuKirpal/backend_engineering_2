// MyOrdersPanel (section 5; board Trade, YOUR ORDERS; board Trade · phone):
// your open orders as a strip of buttons, the picked one's lifecycle beside the
// ledger entries it wrote, and a cancel button. On a phone it is a short list
// with a link to the Orders page.

import { h, cx } from '../../dom.js';
import { OrderTimeline } from '../orders/OrderTimeline.js';
import { LedgerTable } from '../wallet/LedgerTable.js';

function Picked(picked, actions) {
  if (picked.status === 'error') {
    return h('div', { class: 'orders-state' }, h('p', {}, 'This order didn\'t load.'), h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: actions.retry }, 'Try again'));
  }
  if (picked.status === 'loading') return h('div', { class: 'orders-state', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading the order…');
  return h('div', { class: 'orders-body' },
    h('div', { class: 'orders-timeline' }, OrderTimeline(picked.timeline, { label: `Lifecycle of ${picked.title}` })),
    h('div', { class: 'orders-ledger' },
      h('h3', { class: 'panel-label' }, 'Ledger entries for this order'),
      LedgerTable({ rows: picked.ledger, caption: `Ledger entries for ${picked.title}` }),
      h('p', { class: 'ledger-note' }, 'Every balance change writes one of these lines. Your wallet is their sum.')));
}

function Desk(vm, actions) {
  const picked = vm.picked;
  return [
    h('div', { class: 'panel-head orders-head' },
      h('h2', { class: 'panel-label', id: 'my-orders-title' }, 'Your orders'),
      vm.strip.length ? h('div', { class: 'order-strip', role: 'group', 'aria-label': 'Open orders: pick one to see its lifecycle' }, vm.strip.map((o) => h('button', {
        key: o.key,
        type: 'button',
        class: cx('order-chip', { current: o.current }),
        'aria-pressed': String(o.current),
        onClick: () => actions.pick(o.key),
      }, o.label))) : null,
      picked?.canCancel ? h('div', { class: 'orders-cancel-row' }, h('button', {
        type: 'button', class: 'btn btn-secondary btn-xs orders-cancel', disabled: picked.cancelling, onClick: actions.cancel,
      }, picked.cancelling ? 'Cancelling…' : 'Cancel this order')) : null),
    picked ? Picked(picked, actions) : h('div', { class: 'orders-state' }, h('p', {}, vm.empty)),
  ];
}

function Phone(vm) {
  return [
    h('div', { class: 'panel-head orders-head-phone' },
      h('h2', { class: 'panel-label', id: 'my-orders-title' }, `Your orders · ${vm.count}`),
      h('a', { class: 'link', href: '/orders' }, 'See all')),
    vm.rows.length
      ? h('ul', { class: 'plain orders-list' }, vm.rows.map((r) => h('li', { key: r.key, class: 'orders-list-row' },
        h('span', { class: `orders-side tone-${r.tone}` }, r.side),
        h('span', { class: 'orders-what t-mono' }, r.text),
        h('span', { class: `orders-status tone-${r.statusTone}` }, r.status))))
      : h('p', { class: 'orders-state' }, vm.empty ?? 'No open orders on this market.'),
  ];
}

/** vm: the my-orders presenter's vm. `phone` picks the short list. */
export function MyOrdersPanel(vm, actions, { phone = false } = {}) {
  let content;
  if (vm.status === 'guest') {
    content = [
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-label', id: 'my-orders-title' }, 'Your orders')),
      h('div', { class: 'orders-state' }, h('p', {}, 'Log in to see your orders, each one\'s lifecycle and the ledger lines it wrote.'),
        h('a', { class: 'btn btn-secondary btn-sm', href: `/login?next=${encodeURIComponent(vm.next)}` }, 'Log in')),
    ];
  } else if (vm.status !== 'ready') {
    content = [
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-label', id: 'my-orders-title' }, 'Your orders')),
      vm.status === 'error'
        ? h('div', { class: 'orders-state' }, h('p', {}, 'Your orders didn\'t load.'), h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: actions.retry }, 'Try again'))
        : h('div', { class: 'orders-state', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading your orders…'),
    ];
  } else {
    content = phone ? Phone(vm) : Desk(vm, actions);
  }
  return h('section', { class: 'panel orders-panel', 'aria-labelledby': 'my-orders-title' }, content);
}
