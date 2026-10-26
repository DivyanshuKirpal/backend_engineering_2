// Pagination (section 5; Admin · Users): Previous, numbered pages, Next. On
// a phone the numbers give way to "1 of 6".

import { h, cx } from '../../dom.js';

export function Pagination({ pages, current, onPage, label = 'Pages' }) {
  if (pages <= 1) return null;
  return h('nav', { class: 'pagination', 'aria-label': label },
    h('button', { type: 'button', class: 'page-btn page-step', disabled: current <= 1, onClick: () => onPage(current - 1) }, 'Previous'),
    h('ul', { class: 'plain' }, Array.from({ length: pages }, (_, i) => i + 1).map((n) => h('li', { key: n },
      h('button', {
        type: 'button',
        class: cx('page-btn', { current: n === current }),
        'aria-current': n === current ? 'page' : null,
        'aria-label': `Page ${n}`,
        onClick: () => onPage(n),
      }, String(n))))),
    h('span', { class: 'page-of', 'aria-hidden': 'true' }, `${current} of ${pages}`),
    h('button', { type: 'button', class: 'page-btn page-step page-next', disabled: current >= pages, onClick: () => onPage(current + 1) }, 'Next'));
}
