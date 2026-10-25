// The header (section 5, Navbar; Components board AppHeader): brand, the
// demo badge (it opens the demo controls), the main nav, ConnectionStatus,
// NotificationBell, ThemeToggle and UserMenu. Below 768 px the nav and the
// tools fold into a menu, as on the Trade · phone board.

import { h } from '../../dom.js';
import { Icon } from '../ui/Icon.js';
import { Brand } from './Brand.js';
import { DemoControls } from './DemoControls.js';
import { PopoverBackdrop as Backdrop, focusFirst } from '../ui/Popover.js';

export function ConnectionStatus(c) {
  if (!c) return null;
  if (c.state === 'reconnecting') {
    return h('p', { class: 'conn conn-reconnecting', role: 'status' }, Icon('refresh', { size: 14 }), c.label);
  }
  return h('p', { class: `conn conn-${c.state}`, role: 'status' }, h('span', { class: 'conn-dot', 'aria-hidden': 'true' }), c.label);
}

function Bell(bell, actions) {
  return h('div', { class: 'popover-anchor' },
    h('button', {
      class: 'icon-btn bell-btn', type: 'button', 'aria-label': bell.label, 'aria-expanded': String(bell.open), 'aria-haspopup': 'true', onClick: actions.toggleBell,
    }, Icon('bell', { size: 16 }), bell.count ? h('span', { class: 'bell-count', 'aria-hidden': 'true' }, bell.count) : null),
    bell.open ? [
      Backdrop(actions.close),
      h('div', { class: 'popover bell-panel', role: 'dialog', 'aria-label': 'Notifications', ref: focusFirst, onKeyDown: (e) => e.key === 'Escape' && actions.close() },
        h('div', { class: 'popover-head' },
          h('h2', { class: 't-label' }, 'Notifications'),
          bell.canMarkAll ? h('button', { class: 'link', type: 'button', onClick: actions.markAllRead }, 'Mark all read') : null),
        bell.empty ? h('p', { class: 'popover-empty' }, 'Nothing yet. Fills, deposits and account news show up here.') : null,
        h('ul', { class: 'plain bell-list' }, bell.items.map((n) => h('li', { key: n.id },
          h('a', { href: n.href, class: n.unread ? 'bell-item unread' : 'bell-item', onClick: () => actions.readNotification(n.id) },
            h('span', { class: 'bell-item-title' }, n.unread ? h('span', { class: 'sr-only' }, 'Unread: ') : null, n.title),
            h('span', { class: 'bell-item-body' }, n.body),
            h('span', { class: 'bell-item-time t-mono' }, n.time))))),
        h('p', { class: 'undesigned-note' }, 'Not drawn yet: a simple list until the Notifications page is designed.')),
    ] : null);
}

function UserMenu(user, actions) {
  return h('div', { class: 'popover-anchor' },
    h('button', {
      class: 'user-chip', type: 'button', 'aria-expanded': String(user.open), 'aria-haspopup': 'true', onClick: actions.toggleUserMenu,
    }, h('span', { class: user.isAdmin ? 'avatar avatar-admin' : 'avatar', 'aria-hidden': 'true' }, user.initials), h('span', { class: 'user-name' }, user.name)),
    user.open ? [
      Backdrop(actions.close),
      h('div', { class: 'popover user-panel', ref: focusFirst, onKeyDown: (e) => e.key === 'Escape' && actions.close() },
        h('p', { class: 'user-panel-email' }, user.email),
        h('ul', { class: 'plain menu-list' },
          h('li', {}, h('a', { href: '/account/profile' }, 'Profile')),
          h('li', {}, h('a', { href: '/account/security' }, 'Security')),
          h('li', {}, h('a', { href: '/account/verification' }, 'Verification')),
          h('li', {}, h('a', { href: '/wallet/history' }, 'History')),
          user.isAdmin ? h('li', {}, h('a', { href: '/admin' }, 'Admin')) : null,
          h('li', {}, h('button', { type: 'button', onClick: actions.logout }, Icon('logout', { size: 16 }), 'Log out')))),
    ] : null);
}

function PhoneMenu(vm, actions) {
  return [
    Backdrop(actions.close),
    h('div', { class: 'popover phone-menu', id: 'phone-menu', ref: focusFirst, onKeyDown: (e) => e.key === 'Escape' && actions.close() },
      h('nav', { 'aria-label': 'Main' }, h('ul', { class: 'plain menu-list' },
        vm.nav.map((item) => h('li', { key: item.key }, h('a', { href: item.href, 'aria-current': item.current ? 'page' : null }, item.label))))),
      vm.user ? h('ul', { class: 'plain menu-list' },
        h('li', {}, h('a', { href: '/account/profile' }, 'Account')),
        vm.user.isAdmin ? h('li', {}, h('a', { href: '/admin' }, 'Admin')) : null,
        h('li', {}, h('button', { type: 'button', onClick: actions.logout }, 'Log out'))) : h('ul', { class: 'plain menu-list' },
        h('li', {}, h('a', { href: '/login' }, 'Log in')),
        h('li', {}, h('a', { href: '/register' }, 'Create account'))),
      ConnectionStatus(vm.connection)),
  ];
}

/**
 * vm: the navbar presenter's vm. `center` replaces the nav on a phone, e.g.
 * the trade page's market selector.
 */
export function AppHeader(vm, actions, { center = null } = {}) {
  return h('header', { class: 'app-header' },
    Brand({ href: '/', label: 'Orichal home' }),
    center ? h('div', { class: 'header-center' }, center) : null,
    h('div', { class: 'popover-anchor demo-anchor' },
      h('button', { class: 'demo-badge', type: 'button', 'aria-expanded': String(vm.demoOpen), onClick: actions.toggleDemo },
        h('span', { class: 'demo-badge-long' }, 'Simulator · demo funds'),
        h('span', { class: 'demo-badge-short' }, 'Demo')),
      vm.demoOpen ? [Backdrop(actions.close), DemoControls(actions)] : null),
    h('nav', { class: 'header-nav', 'aria-label': 'Main' },
      h('ul', { class: 'plain' }, vm.nav.map((item) => h('li', { key: item.key },
        h('a', { class: 'nav-link', href: item.href, 'aria-current': item.current ? 'page' : null }, item.label))))),
    h('div', { class: 'header-tools' },
      ConnectionStatus(vm.connection),
      vm.bell ? Bell(vm.bell, actions) : null,
      h('button', { class: 'icon-btn theme-btn', type: 'button', 'aria-label': vm.theme.label, title: vm.theme.label, onClick: actions.toggleTheme }, Icon('moon', { size: 16 })),
      vm.user ? UserMenu(vm.user, actions) : [
        h('a', { class: 'btn btn-quiet-flat btn-sm header-login', href: '/login' }, 'Log in'),
        h('a', { class: 'btn btn-primary btn-sm header-register', href: '/register' }, 'Create account'),
      ],
      h('div', { class: 'popover-anchor menu-anchor' },
        h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'Menu', 'aria-expanded': String(vm.menuOpen), 'aria-controls': 'phone-menu', onClick: actions.toggleMenu }, Icon('menu', { size: 20 })),
        vm.menuOpen ? PhoneMenu(vm, actions) : null)));
}
