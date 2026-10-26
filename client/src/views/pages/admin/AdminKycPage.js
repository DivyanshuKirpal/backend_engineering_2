// AdminKycPage (section 5; board Admin · KYC review): Pending, Approved and
// Rejected in the topbar, the list on the left and the open application on
// the right, approved or rejected with a reason.

import { h, render } from '../../dom.js';
import { createAdminKycPresenter } from '/src/presenters/admin/kyc.presenter.js';
import { Tabs } from '../../components/ui/Tabs.js';
import { Pagination } from '../../components/ui/Pagination.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { KycQueueTable, KycReviewPanel } from '../../components/admin/KycReview.js';
import { RejectReasonModal } from '../../components/admin/RejectReasonModal.js';

export const styles = ['/styles/pages/admin.css'];
export const title = () => 'KYC review';

const REASONS = ['Photo too blurry', 'Name doesn\'t match the document', 'Document has expired'];

function Topbar(vm, actions) {
  return [h('h1', { class: 'admin-title' }, 'KYC review'), Tabs({ items: vm.tabs, onSelect: actions.setTab, label: 'Applications', className: 'admin-tabs' })];
}

function KycView(vm, actions) {
  let list;
  if (vm.status === 'error') list = ErrorState({ title: 'The applications didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  else if (vm.status !== 'ready') list = Skeleton({ lines: 7, label: 'Loading applications' });
  else {
    list = [
      h('div', { class: 'table-wrap' }, KycQueueTable(vm, actions)),
      vm.pagination.pages > 1
        ? h('div', { class: 'list-foot' }, h('p', {}, ''), Pagination({ pages: vm.pagination.pages, current: vm.pagination.current, onPage: actions.setPage, label: 'Pages of applications' }))
        : null,
    ];
  }
  return h('div', { class: 'admin-page kyc-page' },
    h('section', { class: 'panel kyc-list', id: 'kyc-list', role: 'tabpanel', 'aria-labelledby': 'kyc-list-label' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-label', id: 'kyc-list-label' }, vm.heading)),
      list),
    vm.review
      ? KycReviewPanel(vm.review, actions)
      : h('section', { class: 'panel kyc-review kyc-review-empty' }, h('p', {}, vm.status === 'ready' ? 'Pick an application to review it.' : '')),
    vm.reject
      ? RejectReasonModal({ ...vm.reject, title: `Reject ${vm.review?.name ?? 'this application'}?`, hint: 'They see this reason and can send their details again.', suggestions: REASONS }, {
        onInput: actions.setReason,
        onConfirm: actions.confirmReject,
        onCancel: actions.cancelReject,
      })
      : null);
}

export function mount(outlet, route, layout) {
  const presenter = createAdminKycPresenter();
  const top = layout.topbar();
  const draw = () => {
    render(top, ...Topbar(presenter.vm, presenter.actions));
    render(outlet, KycView(presenter.vm, presenter.actions));
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
