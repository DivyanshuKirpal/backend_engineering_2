// StatCard (section 5; board Admin · Dashboard): a label, a big number with
// its unit, and a line under it: a change in its tone, or how long the
// oldest item has waited. A queue with something waiting is outlined in brass.

import { h, cx } from '../../dom.js';
import { Icon } from '../ui/Icon.js';

/** c: { key, label, value, unit?, delta?: { text, tone }, note?, wait?, alert? } */
export function StatCard(c) {
  return h('section', { class: cx('panel stat-card', { 'stat-card-alert': c.alert }), 'aria-labelledby': `stat-${c.key}` },
    h('h2', { class: 'stat-label', id: `stat-${c.key}` }, c.label),
    h('p', { class: 'stat-value' }, c.value, c.unit ? h('span', { class: 'stat-unit' }, c.unit) : null),
    c.wait
      ? h('p', { class: 'stat-note stat-wait' }, Icon('clock', { size: 14 }), c.wait)
      : h('p', { class: 'stat-note' },
        c.delta ? h('strong', { class: `stat-delta tone-${c.delta.tone}` }, c.delta.text) : null,
        c.delta ? ' ' : null,
        c.note));
}
