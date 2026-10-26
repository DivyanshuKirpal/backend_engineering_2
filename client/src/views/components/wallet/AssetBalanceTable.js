// AssetBalanceTable (section 5; board Wallet, BALANCES): total, free and
// held per asset, its value in USDT, and links to deposit, withdraw or trade.
// Withdraw is grey text, not a link, when there is nothing free to withdraw.

import { h } from '../../dom.js';
import { Checkbox } from '../ui/Field.js';
import { AssetIcon } from '../market/AssetIcon.js';

function Actions(r) {
  return h('span', { class: 'balance-actions' },
    r.deposit ? h('a', { class: 'link', href: r.deposit }, 'Deposit', h('span', { class: 'sr-only' }, ` ${r.code}`)) : null,
    r.withdraw
      ? h('a', { class: 'link', href: r.withdraw }, 'Withdraw', h('span', { class: 'sr-only' }, ` ${r.code}`))
      : h('span', { class: 'link-off', title: r.withdrawNote }, 'Withdraw', h('span', { class: 'sr-only' }, `: ${r.withdrawNote}`)),
    h('a', { class: 'link', href: r.trade }, 'Trade', h('span', { class: 'sr-only' }, ` ${r.code}`)));
}

/** vm: the wallet presenter's vm. actions: { setHideSmall }. */
export function AssetBalanceTable(vm, actions) {
  return h('section', { class: 'panel wallet-balances', 'aria-labelledby': 'balances-title' },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-label', id: 'balances-title' }, 'Balances'),
      Checkbox({ id: 'hide-small', label: 'Hide small balances', checked: vm.hideSmall, onChange: actions.setHideSmall })),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'table balances-table' },
        h('caption', { class: 'sr-only' }, 'Your balances, valued in USDT'),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col', class: 'col-asset' }, 'Asset'),
          h('th', { scope: 'col', class: 'num col-total' }, 'Total'),
          h('th', { scope: 'col', class: 'num col-free' }, 'Free'),
          h('th', { scope: 'col', class: 'num col-held' }, 'In orders'),
          h('th', { scope: 'col', class: 'num col-value' }, 'Value · USDT'),
          h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
        h('tbody', {}, vm.rows.length
          ? vm.rows.map((r) => h('tr', { key: r.key },
            h('th', { scope: 'row', class: 'col-asset' },
              h('span', { class: 'balance-asset' },
                AssetIcon(r.tile),
                h('span', { class: 'balance-name' }, h('span', { class: 'balance-code' }, r.code), h('span', { class: 'balance-full' }, r.name)))),
            h('td', { class: 'num t-mono col-total' }, r.total),
            h('td', { class: 'num t-mono col-free' }, r.free),
            h('td', { class: 'num t-mono col-held' }, r.held),
            h('td', { class: 'num t-mono col-value' }, r.value),
            h('td', { class: 'col-actions' }, Actions(r))))
          : h('tr', {}, h('td', { colspan: 6, class: 'balances-empty' }, 'Every balance is worth under 1 USDT. Untick "Hide small balances" to see them.'))))),
    vm.hiddenCount && vm.rows.length ? h('p', { class: 'balances-hidden' }, `${vm.hiddenCount} small ${vm.hiddenCount === 1 ? 'balance is' : 'balances are'} hidden.`) : null);
}
