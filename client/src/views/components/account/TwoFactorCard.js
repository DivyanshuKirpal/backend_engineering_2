// TwoFactorCard (section 5; board Account · Security): whether two-factor is
// on, since when, and the button that turns it off or on.

import { h, s, cx } from '../../dom.js';
import { Icon } from '../ui/Icon.js';

/** The board's tick: bold, with round ends, filling the green square. */
const tick = () => s('svg', { viewBox: '0 0 25 25', width: 25, height: 25 },
  s('path', { d: 'M6.2 12.9l4.4 4.3 8.2-8.4', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

/** tf: { on, title, body, action }. */
export function TwoFactorCard(tf, { openTwoFactor }) {
  return h('section', { class: 'panel twofa-card', 'aria-labelledby': 'twofa-card-title' },
    h('span', { class: cx('twofa-mark', { on: tf.on }), 'aria-hidden': 'true' }, tf.on ? tick() : Icon('lock', { size: 15 })),
    h('div', { class: 'twofa-text' },
      h('h2', { class: 'twofa-title', id: 'twofa-card-title' }, tf.title),
      h('p', {}, tf.body)),
    h('button', { type: 'button', class: cx('btn', tf.on ? 'btn-secondary' : 'btn-primary'), onClick: openTwoFactor }, tf.action));
}
