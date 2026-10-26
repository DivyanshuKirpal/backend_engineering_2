// Panels (section 7, Shape): panel-coloured boxes with a 1 px border, an
// optional label row (13 px capitals) with something on its right, and an
// optional footer row of actions under a rule (the account forms). As a
// form, `onSubmit` handles Enter and the submit button.

import { h, cx } from '../../dom.js';

export function Panel({ label = null, labelId = null, aside = null, className = '', as = 'section', bodyClass = '', flush = false, foot = null, onSubmit = null }, ...children) {
  return h(as, { class: cx('panel', className), 'aria-labelledby': label && labelId ? labelId : null, onSubmit, novalidate: as === 'form' ? true : null },
    label ? h('div', { class: 'panel-head' }, h('h2', { class: 'panel-label', id: labelId }, label), aside) : null,
    h('div', { class: cx('panel-body', { 'panel-flush': flush }, bodyClass) }, children),
    foot ? h('div', { class: 'panel-foot' }, foot) : null);
}
