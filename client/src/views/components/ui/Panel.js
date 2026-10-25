// Panels (section 7, Shape): panel-coloured boxes with a 1 px border, an
// optional label row (13 px capitals) with something on its right.

import { h, cx } from '../../dom.js';

export function Panel({ label = null, labelId = null, aside = null, className = '', as = 'section', bodyClass = '', flush = false }, ...children) {
  return h(as, { class: cx('panel', className), 'aria-labelledby': label && labelId ? labelId : null },
    label ? h('div', { class: 'panel-head' }, h('h2', { class: 'panel-label', id: labelId }, label), aside) : null,
    h('div', { class: cx('panel-body', { 'panel-flush': flush }, bodyClass) }, children));
}
