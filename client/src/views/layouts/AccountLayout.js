// AccountLayout (section 5): Navbar, VerifyEmailBanner, AccountSidebar
// (Profile, Security, Verification), the page and Footer.

import { h, render } from '../dom.js';
import { createNavbarPresenter } from '/src/presenters/shared/navbar.presenter.js';
import { AppHeader } from '../components/navigation/AppHeader.js';
import { AppFooter } from '../components/navigation/AppFooter.js';
import { VerifyEmailBanner } from '../components/navigation/VerifyEmailBanner.js';
import { AccountSidebar } from '../components/navigation/AccountSidebar.js';

export function mount(root, route) {
  const navbar = createNavbarPresenter();
  const top = h('div', { class: 'layout-top' });
  const side = h('div', { class: 'account-side' });
  const main = h('main', { id: 'main', class: 'account-main', tabindex: '-1' });
  const bottom = h('div', { class: 'layout-bottom' });
  render(root,
    h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'),
    top,
    h('div', { class: 'layout-main' }, h('div', { class: 'container account-layout' }, side, main)),
    bottom);

  const draw = () => {
    render(top, AppHeader(navbar.vm, navbar.actions), VerifyEmailBanner(navbar.vm.verifyBanner, navbar.actions));
    render(side, AccountSidebar({ path: navbar.vm.path }));
  };
  const off = navbar.subscribe(draw);
  navbar.actions.setPath(route.path);
  draw();
  render(bottom, AppFooter());

  return {
    outlet: main,
    setRoute: (r) => navbar.actions.setPath(r.path),
    unmount() {
      off();
      navbar.dispose();
      render(root);
    },
  };
}
