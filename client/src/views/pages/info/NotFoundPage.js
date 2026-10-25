// NotFoundPage (section 5): no presenter, an EmptyState with ways back.
// Not drawn in the design file; built from the UI kit's EmptyState.

import { h, render } from '../../dom.js';
import { Icon } from '../../components/ui/Icon.js';

export const title = () => 'Page not found';

export function mount(outlet, route) {
  render(outlet, h('div', { class: 'container page' },
    h('section', { class: 'empty-state empty-state-page' },
      Icon('list', { size: 22, className: 'empty-state-icon' }),
      h('p', { class: 't-label t-faint' }, '404'),
      h('h1', { class: 'empty-state-title' }, 'This page doesn\'t exist'),
      h('p', {}, h('span', {}, 'Nothing lives at '), h('code', { class: 't-mono' }, route.path), h('span', {}, '. The link may be old, or the address mistyped.')),
      h('div', { class: 'empty-state-actions' },
        h('a', { class: 'btn btn-primary', href: '/markets' }, 'Go to markets'),
        h('a', { class: 'btn btn-secondary', href: '/' }, 'Home')),
      h('p', { class: 'undesigned-note' }, 'Not drawn yet: built from the UI kit\'s empty state.'))));
  return () => render(outlet);
}
