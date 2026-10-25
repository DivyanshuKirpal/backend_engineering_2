// EmptyState (section 5; UI kit): an icon, a title, a line of help and an
// optional action.

import { h, cx } from '../../dom.js';
import { Icon } from './Icon.js';

export function EmptyState({ title, body, action = null, icon = 'list', className = '', headingLevel = 'h3' }) {
  return h('div', { class: cx('empty-state', className) },
    Icon(icon, { size: 22, className: 'empty-state-icon' }),
    h(headingLevel, { class: 'empty-state-title' }, title),
    body ? h('p', {}, body) : null,
    action);
}

/** Loading rows for a table or a panel (section 5, Skeleton). */
export function Skeleton({ lines = 4, label = 'Loading' }) {
  return h('div', { class: 'skeleton', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'sr-only' }, label),
    Array.from({ length: lines }, (_, i) => h('span', { class: 'skeleton-line', style: { width: `${92 - (i % 3) * 14}%` }, 'aria-hidden': 'true' })));
}

/** ErrorState (section 5): what failed, and a way to try again. */
export function ErrorState({ title = 'This didn\'t load', body, onRetry }) {
  return h('div', { class: 'error-state', role: 'alert' },
    h('p', { class: 'error-state-title' }, title),
    body ? h('p', {}, body) : null,
    onRetry ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: onRetry }, 'Try again') : null);
}
