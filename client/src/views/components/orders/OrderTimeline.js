// OrderTimeline (section 5; section 7, Order lifecycle): placed, on the book,
// each fill, then waiting, filled or cancelled. A solid dot is a step done, a
// half dot a part fill, a hollow dot where the order waits now; the rule
// turns dotted on the way to "now".

import { h, cx } from '../../dom.js';

/** items: [{ key, time, title, body, state: 'done' | 'part' | 'now' | 'stopped' }] */
export function OrderTimeline(items, { label = 'Order lifecycle' } = {}) {
  return h('ol', { class: 'timeline', 'aria-label': label }, items.map((item, i) => h('li', {
    key: item.key,
    class: cx('timeline-item', `timeline-${item.state}`, { 'timeline-to-now': items[i + 1]?.state === 'now' }),
  },
  h('span', { class: 'timeline-dot', 'aria-hidden': 'true' }),
  h('span', { class: 'timeline-time t-mono' }, item.time),
  h('p', { class: 'timeline-text' }, h('strong', {}, item.title), ' ', item.body))));
}
