// OrderDetailDrawer (section 5; board Orders · detail drawer open): what the
// order is and how much has filled, its average, proceeds, fee and what it
// still locks, the client order id, its lifecycle, the ledger lines it wrote,
// and cancelling the rest while it is open.

import { h } from '../../dom.js';
import { Drawer } from '../ui/Overlay.js';
import { Skeleton, ErrorState } from '../ui/EmptyState.js';
import { OrderTimeline } from './OrderTimeline.js';
import { LedgerTable } from '../wallet/LedgerTable.js';

/** The filled share as a bar; the label beside it says the same in words. */
function FillBar(value) {
  return h('div', { class: 'fill-bar', 'aria-hidden': 'true' },
    value > 0 ? h('span', { class: 'fill-bar-done', style: { '--fill': value / 100 } }) : null,
    value < 100 ? h('span', { class: 'fill-bar-rest' }) : null);
}

/** d: the orders presenter's drawer vm. */
export function OrderDetailDrawer(d, { onClose, onCancel, onRetry }) {
  let body;
  if (d.status === 'error') {
    body = h('div', { class: 'drawer-section' }, ErrorState({ title: 'This order didn\'t load', body: 'Check the connection and try again.', onRetry }));
  } else if (d.status !== 'ready') {
    body = h('div', { class: 'drawer-section' }, Skeleton({ lines: 8, label: 'Loading the order' }));
  } else {
    body = [
      h('section', { class: 'drawer-section order-summary', 'aria-label': 'Summary' },
        h('p', { class: 'order-kind' }, h('strong', { class: `tone-${d.kind.tone}` }, d.kind.label), d.context),
        h('p', { class: 'order-headline' }, d.headline),
        h('div', { class: 'order-progress' },
          FillBar(d.progress.value),
          h('span', { class: 'order-progress-label' }, d.progress.label))),
      h('section', { class: 'drawer-section order-facts-section', 'aria-label': 'Fills and fees' },
        h('dl', { class: 'order-facts' },
          d.facts.map((f) => h('div', { key: f.key, class: 'order-fact' }, h('dt', {}, f.label), h('dd', { class: 't-mono' }, f.value))),
          h('div', { class: 'order-fact order-fact-wide' }, h('dt', {}, 'Client order id'), h('dd', { class: 't-mono order-client-id' }, d.clientOrderId)))),
      h('section', { class: 'drawer-section order-lifecycle', 'aria-labelledby': 'order-lifecycle-label' },
        h('h3', { class: 'panel-label', id: 'order-lifecycle-label' }, 'Lifecycle'),
        OrderTimeline(d.timeline, { label: `Lifecycle of order ${d.id}` })),
      h('section', { class: 'drawer-section order-ledger', 'aria-labelledby': 'order-ledger-label' },
        h('h3', { class: 'panel-label', id: 'order-ledger-label' }, 'Ledger entries'),
        LedgerTable({ rows: d.ledger, caption: `Ledger entries for order ${d.id}`, heads: ['Entry', 'Asset', 'Free', 'Locked'] })),
      d.cancel
        ? h('div', { class: 'drawer-section order-cancel' },
          h('button', { type: 'button', class: 'btn btn-danger-outline btn-block', disabled: d.cancel.busy, onClick: onCancel }, d.cancel.label),
          h('p', {}, d.cancel.note))
        : null,
    ];
  }

  return Drawer({
    title: 'Order',
    titleId: 'order-drawer-title',
    labelExtra: [' ', h('span', { class: 'order-drawer-id t-mono' }, d.id)],
    onClose,
    className: 'order-drawer',
    closeLabel: 'Close the order',
  }, body);
}
