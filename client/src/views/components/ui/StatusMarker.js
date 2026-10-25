// Status markers (section 7; UI kit, "Status markers"). The presenter names
// the marker and the tone (status.format.js); the label is always printed, so
// the shape and the word carry the meaning as well as the colour.

import { h, s, cx } from '../../dom.js';

const SHAPES = {
  hollow: () => s('rect', { x: 1.5, y: 1.5, width: 9, height: 9, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
  solid: () => s('rect', { x: 1, y: 1, width: 10, height: 10, fill: 'currentColor' }),
  square: () => s('rect', { x: 1, y: 1, width: 10, height: 10, fill: 'currentColor' }),
  half: () => [
    s('rect', { x: 1.5, y: 1.5, width: 9, height: 9, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    s('rect', { x: 1.5, y: 1.5, width: 4.5, height: 9, fill: 'currentColor' }),
  ],
  tick: () => s('path', { d: 'M1.5 6.5l3 3 6-7', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'square' }),
  dash: () => s('path', { d: 'M1.5 6h9', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }),
  cross: () => s('path', { d: 'M2 2l8 8M10 2l-8 8', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }),
  pause: () => [s('rect', { x: 2, y: 1.5, width: 3, height: 9, fill: 'currentColor' }), s('rect', { x: 7, y: 1.5, width: 3, height: 9, fill: 'currentColor' })],
  clock: () => [s('circle', { cx: 6, cy: 6, r: 4.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }), s('path', { d: 'M6 3.4V6l1.8 1.2', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 })],
  lock: () => [s('rect', { x: 2, y: 5.5, width: 8, height: 5.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }), s('path', { d: 'M4 5.5V4a2 2 0 0 1 4 0v1.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 })],
};

/** { label, marker, tone } from status.format.js. `size` 'sm' fits dense tables. */
export function StatusMarker({ label, marker, tone }, { size = 'md', className = '' } = {}) {
  if (marker === 'tag') return h('span', { class: cx('status-tag', className) }, label);
  const shape = SHAPES[marker];
  return h('span', { class: cx('status', `status-${tone}`, `status-${size}`, className) },
    shape ? s('svg', { class: `status-mark status-mark-${marker}`, viewBox: '0 0 12 12', width: 12, height: 12, 'aria-hidden': 'true' }, shape()) : null,
    h('span', { class: 'status-label' }, label));
}
