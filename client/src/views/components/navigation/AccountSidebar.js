// AccountSidebar (section 5): Profile, Security, Verification.

import { h } from '../../dom.js';

const LINKS = [['Profile', '/account/profile'], ['Security', '/account/security'], ['Verification', '/account/verification']];

export function AccountSidebar({ path }) {
  return h('nav', { class: 'account-nav', 'aria-label': 'Account' },
    h('ul', { class: 'plain' }, LINKS.map(([label, href]) => h('li', {},
      h('a', { href, 'aria-current': path === href ? 'page' : null }, label)))));
}
