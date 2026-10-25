// What a page shows while its module loads, and when it fails (section 5,
// Skeleton and ErrorState). The router draws these in the page's outlet.

import { h } from '../../dom.js';

export function PageLoading() {
  return h('div', { class: 'page-state', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'spinner', 'aria-hidden': 'true' }),
    h('span', { class: 'sr-only' }, 'Loading the page'));
}

export function PageError({ title, body, onRetry }) {
  return h('div', { class: 'page-state container', role: 'alert' },
    h('h1', { class: 't-section' }, title),
    h('p', { class: 't-muted' }, body),
    onRetry ? h('button', { class: 'btn btn-secondary', type: 'button', onClick: onRetry }, 'Try again') : null);
}
