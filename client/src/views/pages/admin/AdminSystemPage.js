// AdminSystemPage (section 5; board Admin · System): the stack's health,
// refreshed every 5 seconds, and the engine market by market.

import { h, render } from '../../dom.js';
import { createAdminSystemPresenter } from '/src/presenters/admin/system.presenter.js';
import { Icon } from '../../components/ui/Icon.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { HealthGrid, EngineStatusCard } from '../../components/admin/SystemHealth.js';

export const styles = ['/styles/pages/admin.css'];
export const title = () => 'System';

function Topbar(vm, actions) {
  return [
    h('h1', { class: 'admin-title' }, 'System'),
    vm.checked ? h('p', { class: 'admin-subtitle', 'aria-live': 'off' }, vm.checked) : null,
    h('button', { type: 'button', class: 'btn btn-secondary btn-sm admin-topbar-action', onClick: actions.openGrafana }, 'Open Grafana', Icon('external', { size: 12 })),
  ];
}

function SystemView(vm, actions) {
  if (vm.status === 'error') return ErrorState({ title: 'The health check didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  if (vm.status !== 'ready') return Skeleton({ lines: 8, label: 'Checking the system' });
  return h('div', { class: 'admin-page system-page' },
    HealthGrid(vm.cards),
    EngineStatusCard(vm.markets));
}

export function mount(outlet, route, layout) {
  const presenter = createAdminSystemPresenter();
  const top = layout.topbar();
  const draw = () => {
    render(top, ...Topbar(presenter.vm, presenter.actions));
    render(outlet, SystemView(presenter.vm, presenter.actions));
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
