// AdminTopbar (section 5): the page's own title area on the left (pages render
// into the slot), ThemeToggle and the admin's name on the right.

import { h } from '../../dom.js';
import { Icon } from '../ui/Icon.js';

export function AdminTopbarTools(vm, actions) {
  return h('div', { class: 'admin-topbar-tools' },
    h('button', { class: 'icon-btn theme-btn', type: 'button', 'aria-label': vm.theme.label, title: vm.theme.label, onClick: actions.toggleTheme }, Icon('moon', { size: 16 })),
    vm.user ? h('div', { class: 'popover-anchor' },
      h('button', { class: 'user-chip', type: 'button', 'aria-expanded': String(vm.user.open), 'aria-haspopup': 'true', onClick: actions.toggleUserMenu },
        h('span', { class: 'avatar avatar-admin', 'aria-hidden': 'true' }, vm.user.initials),
        h('span', { class: 'user-name' }, vm.user.name)),
      vm.user.open ? [
        h('button', { class: 'popover-backdrop', type: 'button', tabindex: '-1', 'aria-hidden': 'true', onClick: actions.close }),
        h('div', { class: 'popover user-panel', ref: (el) => { if (!el.__focused) { el.__focused = true; el.querySelector('a, button')?.focus(); } }, onKeyDown: (e) => e.key === 'Escape' && actions.close() },
          h('p', { class: 'user-panel-email' }, vm.user.email),
          h('ul', { class: 'plain menu-list' },
            h('li', {}, h('a', { href: '/markets' }, 'Back to the exchange')),
            h('li', {}, h('a', { href: '/account/profile' }, 'Your account')),
            h('li', {}, h('button', { type: 'button', onClick: actions.logout }, Icon('logout', { size: 16 }), 'Log out')))),
      ] : null) : null);
}
