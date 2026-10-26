// AdminDashboardPage (section 5; board Admin · Dashboard): six numbers, the
// traded volume of the last fourteen days, and the KYC and withdrawal queues.

import { h, render } from '../../dom.js';
import { createAdminDashboardPresenter } from '/src/presenters/admin/dashboard.presenter.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { StatCard } from '../../components/admin/StatCard.js';
import { QueueCard } from '../../components/admin/QueueCard.js';
import { VolumeBarChart } from '../../components/charts/VolumeBarChart.js';

export const styles = ['/styles/pages/admin.css'];
export const title = () => 'Dashboard';

function Topbar(vm) {
  return [h('h1', { class: 'admin-title' }, 'Dashboard'), vm.updated ? h('p', { class: 'admin-subtitle' }, vm.updated) : null];
}

function DashboardView(vm, actions) {
  if (vm.status === 'error') return ErrorState({ title: 'The dashboard didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  if (vm.status !== 'ready') return Skeleton({ lines: 8, label: 'Loading the dashboard' });
  return h('div', { class: 'admin-page dashboard-page' },
    h('div', { class: 'stat-grid' }, vm.cards.map((c) => StatCard(c))),
    VolumeBarChart(vm.volume, { onView: actions.setView }),
    h('div', { class: 'queue-grid' },
      QueueCard(vm.queues[0], { id: 'kyc-queue' }),
      QueueCard(vm.queues[1], { id: 'withdrawal-queue' })));
}

export function mount(outlet, route, layout) {
  const presenter = createAdminDashboardPresenter();
  const top = layout.topbar();
  const draw = () => {
    render(top, ...Topbar(presenter.vm));
    render(outlet, DashboardView(presenter.vm, presenter.actions));
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
