// BalanceOverviewCard (section 5; board Wallet, TOTAL VALUE): the wallet's
// value at live prices, split into what is free and what open orders and
// pending withdrawals hold.

import { h } from '../../dom.js';

/** vm: { total, free, held } as text. */
export function BalanceOverviewCard(vm) {
  return h('section', { class: 'panel wallet-total', 'aria-labelledby': 'wallet-total-title' },
    h('h2', { class: 'panel-label', id: 'wallet-total-title' }, 'Total value'),
    h('p', { class: 'wallet-total-value' }, h('span', { class: 'wallet-total-amount' }, vm.total), ' ', h('span', { class: 'wallet-total-unit' }, 'USDT')),
    h('dl', { class: 'wallet-split' },
      h('div', {},
        h('dt', {}, 'Free to use'),
        h('dd', {}, h('span', { class: 'wallet-split-amount' }, vm.free), ' ', h('span', { class: 'wallet-split-unit' }, 'USDT'))),
      h('div', {},
        h('dt', {}, 'Held in orders and withdrawals'),
        h('dd', {}, h('span', { class: 'wallet-split-amount' }, vm.held), ' ', h('span', { class: 'wallet-split-unit' }, 'USDT')))),
    h('p', { class: 'wallet-note' }, 'Held amounts are locked by your open orders and pending withdrawals, and come back when those close.'));
}
