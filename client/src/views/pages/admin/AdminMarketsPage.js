// AdminMarketsPage (section 5): every market's fees and limits, with editing,
// halt and resume, and the form for a new market. Not drawn yet: built from
// the admin pages' panels and the Fees table.

import { h, render } from '../../dom.js';
import { createAdminMarketsPresenter } from '/src/presenters/admin/markets.presenter.js';
import { ConfirmDialog } from '../../components/ui/Overlay.js';
import { Checkbox } from '../../components/ui/Field.js';
import { Icon } from '../../components/ui/Icon.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { MarketAdminTable, MarketFormModal } from '../../components/admin/MarketAdmin.js';

export const styles = ['/styles/pages/admin.css'];
export const title = () => 'Markets';

function Topbar(vm, actions) {
  return [
    h('h1', { class: 'admin-title' }, 'Markets'),
    vm.subtitle ? h('p', { class: 'admin-subtitle' }, vm.subtitle) : null,
    h('button', { type: 'button', class: 'btn btn-secondary btn-sm admin-topbar-action', onClick: actions.startCreate }, Icon('plus', { size: 12 }), 'New market'),
  ];
}

function MarketsView(vm, actions) {
  let body;
  if (vm.status === 'error') body = ErrorState({ title: 'The markets didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  else if (vm.status !== 'ready') body = Skeleton({ lines: 5, label: 'Loading markets' });
  else {
    body = [
      h('section', { class: 'panel', 'aria-label': 'Markets' }, h('div', { class: 'table-wrap' }, MarketAdminTable(vm.rows, actions))),
      h('div', { class: 'wd-explain market-admin-notes' },
        h('section', { class: 'panel wd-card' },
          h('h2', {}, 'Halt and resume'),
          h('p', {}, 'A halt stops new orders and pulls the market maker\'s ladder; orders on the book can still be cancelled, or cancelled all at once. Tick and step change only while halted with no open orders.')),
        h('section', { class: 'panel wd-card market-create-note' },
          h('h2', {}, vm.create.title),
          h('p', {}, vm.create.body))),
      h('p', { class: 'undesigned-note' }, 'Not drawn yet: built from the admin pages\' panels and the Fees table.'),
    ];
  }
  return h('div', { class: 'admin-page markets-admin-page' },
    body,
    vm.form ? MarketFormModal(vm.form, actions) : null,
    vm.confirm
      ? ConfirmDialog({
        title: vm.confirm.title,
        titleId: 'market-confirm-title',
        body: vm.confirm.body,
        confirmLabel: vm.confirm.confirmLabel,
        cancelLabel: vm.confirm.cancelLabel,
        tone: vm.confirm.tone,
        busy: vm.confirm.busy,
        onConfirm: actions.runConfirm,
        onCancel: actions.cancelConfirm,
        children: vm.confirm.kind === 'halt'
          ? Checkbox({ id: 'halt-cancel-orders', label: vm.confirm.cancelOrdersLabel, checked: vm.confirm.cancelOrders, onChange: actions.setCancelOrders })
          : null,
      })
      : null);
}

export function mount(outlet, route, layout) {
  const presenter = createAdminMarketsPresenter();
  const top = layout.topbar();
  const draw = () => {
    render(top, ...Topbar(presenter.vm, presenter.actions));
    render(outlet, MarketsView(presenter.vm, presenter.actions));
  };
  draw();
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    render(top);
    render(outlet);
  };
}
