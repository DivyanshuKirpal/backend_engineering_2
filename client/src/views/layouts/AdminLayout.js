// AdminLayout (section 5): AdminSidebar, AdminTopbar and the page. The
// topbar's left side is the page's own (`topbar()` is the slot it renders into).

import { h, render } from '../dom.js';
import { createNavbarPresenter } from '/src/presenters/shared/navbar.presenter.js';
import { AdminSidebar } from '../components/navigation/AdminSidebar.js';
import { AdminTopbarTools } from '../components/navigation/AdminTopbar.js';

export function mount(root, route) {
  const navbar = createNavbarPresenter({ admin: true });
  const side = h('div', { class: 'admin-side' });
  const tools = h('div', { class: 'admin-topbar-right' });
  const title = h('div', { class: 'admin-topbar-title' });
  const main = h('main', { id: 'main', class: 'admin-main', tabindex: '-1' });
  render(root,
    h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'),
    h('div', { class: 'admin-layout' },
      side,
      h('div', { class: 'admin-body' }, h('header', { class: 'admin-topbar' }, title, tools), main)));
  root.classList.add('app-admin');

  const draw = () => {
    render(side, AdminSidebar(navbar.vm, navbar.actions));
    render(tools, AdminTopbarTools(navbar.vm, navbar.actions));
  };
  const off = navbar.subscribe(draw);
  navbar.actions.setPath(route.path);
  draw();

  return {
    outlet: main,
    topbar: () => title,
    setRoute: (r) => navbar.actions.setPath(r.path),
    unmount() {
      off();
      navbar.dispose();
      root.classList.remove('app-admin');
      render(root);
    },
  };
}
