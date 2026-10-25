// AuthLayout (section 5): no presenter. An ink brand panel on the left and a
// centred card on the right. The page renders the panel's words into `aside`
// and its card into `outlet`.

import { h, render } from '../dom.js';
import { Brand } from '../components/navigation/Brand.js';

export function mount(root) {
  const aside = h('div', { class: 'auth-aside-body' });
  const main = h('main', { id: 'main', class: 'auth-main', tabindex: '-1' });
  render(root,
    h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'),
    h('div', { class: 'auth-layout' },
      h('aside', { class: 'auth-aside' },
        Brand({ href: '/', onInk: true }),
        aside,
        h('p', { class: 'auth-aside-foot' }, 'Simulated exchange. No real money and no blockchain.')),
      main));
  root.classList.add('app-auth');
  return {
    outlet: main,
    aside,
    unmount() {
      root.classList.remove('app-auth');
      render(root);
    },
  };
}
