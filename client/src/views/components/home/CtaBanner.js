// CtaBanner (section 5): the closing sign-up banner, for visitors only.

import { h } from '../../dom.js';

export function CtaBanner() {
  return h('section', { class: 'cta container', 'aria-labelledby': 'cta-title' },
    h('div', { class: 'cta-box' },
      h('div', {},
        h('h2', { class: 'cta-title', id: 'cta-title' }, 'Start with 10,000 demo USDT.'),
        h('p', { class: 'cta-body' }, 'Make an account, place your first order, then watch it move from the queue to the ledger.')),
      h('a', { class: 'btn btn-primary btn-lg', href: '/register' }, 'Create a demo account')));
}
