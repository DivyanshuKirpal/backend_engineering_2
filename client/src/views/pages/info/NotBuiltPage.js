// For Stretch pages (section 2): the route exists and the links work, but the
// page waits until the Core pages are done. Not drawn in the design file.

import { h, render } from '../../dom.js';
import { Icon } from '../../components/ui/Icon.js';

export function forPage(name) {
  return {
    title: () => name,
    mount(outlet) {
      render(outlet, h('div', { class: 'container page' },
        h('section', { class: 'empty-state empty-state-page' },
          Icon('list', { size: 22, className: 'empty-state-icon' }),
          h('h1', { class: 'empty-state-title' }, `${name} isn't built yet`),
          h('p', {}, 'It is a Stretch page in the plan, so it comes after every Core page works end to end.'),
          h('div', { class: 'empty-state-actions' },
            h('a', { class: 'btn btn-primary', href: '/markets' }, 'Go to markets'),
            h('a', { class: 'btn btn-secondary', href: '/' }, 'Home')),
          h('p', { class: 'undesigned-note' }, 'Not drawn yet: placeholder for a Stretch page.'))));
      return () => render(outlet);
    },
  };
}
