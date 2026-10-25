// The Orichal mark and wordmark (section 7, Name and mark).

import { h } from '../../dom.js';
import { Icon } from '../ui/Icon.js';

export function Brand({ href = '/', label = 'Orichal home', tag = null, onInk = false } = {}) {
  return h('a', { class: onInk ? 'brand brand-on-ink' : 'brand', href, 'aria-label': label },
    Icon('mark', { size: 22, className: 'brand-mark' }),
    h('span', { class: 'wordmark', 'aria-hidden': 'true' }, 'ORICHAL'),
    tag ? h('span', { class: 'brand-tag', 'aria-hidden': 'true' }, tag) : null);
}
