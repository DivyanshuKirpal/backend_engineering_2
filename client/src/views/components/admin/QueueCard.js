// QueueCard (section 5; board Admin · Dashboard): how many are waiting, the
// first three, oldest first, with how long each has waited (the oldest in
// brass), and a way to the full queue.

import { h, cx } from '../../dom.js';

/** q: { title, count, href, rows: [{ key, name, detail, mono, waited, oldest }], empty } */
export function QueueCard(q, { id }) {
  return h('section', { class: 'panel queue-card', 'aria-labelledby': `${id}-title` },
    h('div', { class: 'queue-head' },
      h('h2', { class: 'queue-title', id: `${id}-title` }, q.title),
      h('span', { class: 'queue-count' }, q.count)),
    q.rows.length
      ? h('ul', { class: 'plain queue-list' }, q.rows.map((r) => h('li', { key: r.key, class: 'queue-row' },
        h('span', { class: 'queue-name' }, r.name),
        h('span', { class: cx('queue-detail', { 't-mono': r.mono }) }, r.detail),
        h('span', { class: cx('queue-wait t-mono', { 'queue-wait-oldest': r.oldest }) }, h('span', { class: 'sr-only' }, 'waited '), r.waited))))
      : h('p', { class: 'queue-empty' }, q.empty),
    h('div', { class: 'queue-foot' }, h('a', { class: 'btn btn-primary', href: q.href }, 'Review the queue')));
}
