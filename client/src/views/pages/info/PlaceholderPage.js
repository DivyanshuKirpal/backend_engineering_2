// Stands in for a Core page until its step of the build replaces it.

import { h, render } from '../../dom.js';

export function placeholder(name) {
  return {
    title: () => name,
    mount(outlet) {
      render(outlet, h('div', { class: 'container page' },
        h('h1', { class: 't-title' }, name),
        h('p', { class: 't-muted', style: { marginTop: '12px' } }, 'This page is part of the build plan and comes in a later step.')));
      return () => render(outlet);
    },
  };
}
