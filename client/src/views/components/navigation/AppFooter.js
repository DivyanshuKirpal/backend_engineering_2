// The footer (section 5, Footer; Components board AppFooter).

import { h } from '../../dom.js';
import { Brand } from './Brand.js';

const COLUMNS = [
  ['Exchange', [['Markets', '/markets'], ['Trade', '/trade/BTC-USDT'], ['Convert', '/convert'], ['Fees', '/fees']]],
  ['Account', [['Wallet', '/wallet'], ['Orders', '/orders'], ['Security', '/account/security'], ['Verification', '/account/verification']]],
  ['Legal', [['Terms of use', '/legal/terms'], ['Privacy', '/legal/privacy'], ['Risk notice', '/legal/risk']]],
];

export function AppFooter() {
  return h('footer', { class: 'app-footer' },
    h('div', { class: 'container' },
      h('div', { class: 'footer-grid' },
        h('div', { class: 'footer-about' },
          Brand({ href: '/', onInk: true }),
          h('p', {}, 'A simulated spot exchange for BTC, ETH, SOL and BNB against USDT. Demo funds only: no real money and no blockchain.')),
        COLUMNS.map(([title, links]) => h('nav', { class: 'footer-col', 'aria-label': title },
          h('h2', { class: 'footer-title' }, title),
          h('ul', { class: 'plain' }, links.map(([label, href]) => h('li', {}, h('a', { href }, label))))))),
      h('div', { class: 'footer-bottom' },
        h('p', {}, '© 2026 Orichal'),
        h('p', {}, 'Prices follow a public market feed, or a random walk when the feed is offline.'))));
}
