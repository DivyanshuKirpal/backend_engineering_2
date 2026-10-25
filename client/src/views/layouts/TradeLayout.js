// TradeLayout (section 5): Navbar, VerifyEmailBanner and the page at full
// height, with no footer. On a phone the header's middle holds the page's
// market selector (`headerCenter()` is the slot the page renders into).

import { h, render } from '../dom.js';
import { createNavbarPresenter } from '/src/presenters/shared/navbar.presenter.js';
import { AppHeader } from '../components/navigation/AppHeader.js';
import { VerifyEmailBanner } from '../components/navigation/VerifyEmailBanner.js';

export function mount(root, route) {
  const navbar = createNavbarPresenter();
  const top = h('div', { class: 'layout-top' });
  const main = h('main', { id: 'main', class: 'layout-main layout-trade', tabindex: '-1' });
  render(root, h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'), top, main);
  root.classList.add('app-trade');

  let center = null;
  const centerSlot = () => h('div', { class: 'header-market', keep: true, ref: (el) => { center = el; } });
  const draw = () => render(top, AppHeader(navbar.vm, navbar.actions, { center: centerSlot() }), VerifyEmailBanner(navbar.vm.verifyBanner, navbar.actions));
  const off = navbar.subscribe(draw);
  navbar.actions.setPath(route.path);
  draw();

  return {
    outlet: main,
    headerCenter: () => center,
    setRoute: (r) => navbar.actions.setPath(r.path),
    unmount() {
      off();
      navbar.dispose();
      root.classList.remove('app-trade');
      render(root);
    },
  };
}
