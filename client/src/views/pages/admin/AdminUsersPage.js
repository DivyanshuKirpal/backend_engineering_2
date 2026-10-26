// AdminUsersPage (section 5; board Admin · Users): search and filter people,
// ten to a page, each with a link to their page.

import { h, render } from '../../dom.js';
import { createAdminUsersPresenter } from '/src/presenters/admin/users.presenter.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { Pagination } from '../../components/ui/Pagination.js';
import { UserFilters, UserTable } from '../../components/admin/UserTable.js';

export const styles = ['/styles/pages/admin.css'];
export const title = () => 'Users';

function Topbar(vm) {
  return [h('h1', { class: 'admin-title' }, 'Users'), vm.subtitle ? h('p', { class: 'admin-subtitle' }, vm.subtitle) : null];
}

function UsersView(vm, actions) {
  let body;
  if (vm.status === 'error') body = ErrorState({ title: 'The people didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  else if (vm.status !== 'ready') body = Skeleton({ lines: 10, label: 'Loading people' });
  else {
    body = [
      h('div', { class: 'table-wrap' }, UserTable(vm)),
      h('div', { class: 'list-foot' },
        h('p', {}, vm.summary),
        Pagination({ pages: vm.pagination.pages, current: vm.pagination.current, onPage: actions.setPage, label: 'Pages of people' })),
    ];
  }
  return h('div', { class: 'admin-page users-page' },
    UserFilters(vm.filters, actions),
    h('section', { class: 'panel users-panel', 'aria-label': 'People' }, body));
}

export function mount(outlet, route, layout) {
  const presenter = createAdminUsersPresenter();
  const top = layout.topbar();
  const draw = () => {
    render(top, ...Topbar(presenter.vm));
    render(outlet, UsersView(presenter.vm, presenter.actions));
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
