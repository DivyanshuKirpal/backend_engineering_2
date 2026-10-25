// PriceChange (section 5): a signed percentage with an arrow, in the tone the
// presenter picked: ▲ +1.84% or ▼ −2.31%. The arrow is decoration; the sign
// and an accessible label carry the direction.

import { h, cx } from '../../dom.js';

/** vm: { arrow, text, tone, label } from number.format.change(). */
export function PriceChange({ arrow, text, tone, label }, { className = '' } = {}) {
  return h('span', { class: cx('change', `tone-${tone}`, 't-mono', className) },
    arrow ? h('span', { class: 'change-arrow', 'aria-hidden': 'true' }, arrow) : null,
    h('span', { 'aria-hidden': 'true' }, text),
    h('span', { class: 'sr-only' }, label));
}
