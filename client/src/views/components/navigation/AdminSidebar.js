// AdminSidebar (section 5; Components board AdminSidebar): ink panel, queue
// counts on KYC review and Withdrawals, a way back to the exchange.

import { h } from '../../dom.js';
import { Icon } from '../ui/Icon.js';
import { Brand } from './Brand.js';

export function AdminSidebar(vm, actions) {
  return h('aside', { class: vm.menuOpen ? 'admin-sidebar open' : 'admin-sidebar' },
    h('div', { class: 'admin-sidebar-head' },
      Brand({ href: '/admin', label: 'Orichal admin home', tag: 'Admin', onInk: true }),
      h('button', { class: 'icon-btn admin-menu-btn', type: 'button', 'aria-label': 'Admin menu', 'aria-expanded': String(vm.menuOpen), 'aria-controls': 'admin-nav', onClick: actions.toggleMenu }, Icon('menu', { size: 20 }))),
    h('nav', { id: 'admin-nav', class: 'admin-nav', 'aria-label': 'Admin' },
      h('ul', { class: 'plain' }, vm.adminNav.map((item) => h('li', { key: item.key },
        h('a', { href: item.href, 'aria-current': item.current ? 'page' : null },
          h('span', {}, item.label),
          item.badge ? h('span', { class: 'admin-badge' }, h('span', { class: 'sr-only' }, ', waiting: '), String(item.badge)) : null)))),
      h('a', { class: 'admin-back', href: '/markets' }, Icon('chevron-left', { size: 14 }), 'Back to the exchange')));
}
