// MarketHeader and MarketSelector (section 5; board Trade): the pair as the
// page heading, the asset name as the market switcher, the live price and
// change, the 24-hour figures, and the market's rules in a plate on the right.
// On a phone the switcher moves into the header and the price takes a line of
// its own, as on the Trade · phone board.

import { h, cx } from '../../dom.js';
import { SearchInput } from '../ui/Field.js';
import { PopoverBackdrop, focusFirst } from '../ui/Popover.js';
import { AssetIcon } from '../market/AssetIcon.js';
import { PriceChange } from '../market/PriceChange.js';

/** The switcher's list of markets, with a search field. */
function SelectorPanel(selector, actions, id) {
  return [
    PopoverBackdrop(actions.closeSelector),
    h('div', {
      class: 'popover market-menu',
      id,
      role: 'dialog',
      'aria-label': 'Switch market',
      ref: focusFirst,
      onKeyDown: (e) => e.key === 'Escape' && actions.closeSelector(),
    },
    SearchInput({ id: `${id}-search`, label: 'Search markets', value: selector.query, placeholder: 'Search by name or code', onInput: actions.search }),
    selector.empty ? h('p', { class: 'popover-empty' }, selector.empty) : null,
    h('ul', { class: 'plain market-menu-list' }, selector.rows.map((r) => h('li', { key: r.key },
      h('a', { href: r.href, class: cx('market-menu-item', { current: r.current }), 'aria-current': r.current ? 'page' : null, onClick: actions.closeSelector },
        AssetIcon(r.tile, { size: 'sm' }),
        h('span', { class: 'market-menu-name' }, h('strong', {}, r.pair), h('span', {}, r.halted ? `${r.name} · halted` : r.name)),
        h('span', { class: 'market-menu-price t-mono' }, r.last),
        PriceChange(r.change)))))),
  ];
}

/** The asset name with a caret; it opens the switcher. */
function Switch(vm, actions, { id, label, className }) {
  return h('div', { class: cx('popover-anchor', className) },
    h('button', {
      type: 'button',
      class: 'market-switch',
      'aria-expanded': String(vm.selector.open),
      'aria-controls': vm.selector.open ? id : null,
      'aria-haspopup': 'dialog',
      onClick: actions.toggleSelector,
    }, label, h('span', { class: 'market-caret', 'aria-hidden': 'true' }, '▾'), h('span', { class: 'sr-only' }, ', switch market')),
    vm.selector.open ? SelectorPanel(vm.selector, actions, id) : null);
}

/** The phone header's middle: BTC/USDT ▾. */
export function HeaderMarketSwitch(vm, actions) {
  if (!vm) return null;
  return Switch(vm, actions, { id: 'market-menu-phone', label: h('span', { class: 'market-switch-pair' }, vm.pair), className: 'market-switch-phone' });
}

export function MarketHeader(vm, actions) {
  return h('section', { class: 'market-bar', 'aria-labelledby': 'market-title' },
    h('div', { class: 'market-id' },
      h('h1', { class: 'market-pair', id: 'market-title' }, vm.pair),
      Switch(vm, actions, { id: 'market-menu', label: vm.name, className: 'market-switch-desk' })),
    h('p', { class: 'market-price' },
      h('span', { class: 'market-last t-mono' }, h('span', { class: 'sr-only' }, 'Last price '), vm.last),
      PriceChange(vm.change)),
    h('p', { class: 'market-summary t-mono' }, vm.summary),
    h('dl', { class: 'market-stats' }, vm.stats.map((s) => h('div', { key: s.key, class: 'market-stat' },
      h('dt', {}, s.label),
      h('dd', { class: 't-mono' }, s.value)))),
    h('dl', { class: 'market-specs' }, vm.specs.map((s) => h('div', { key: s.key, class: cx('market-spec', { 'market-spec-words': s.words }) },
      h('dt', { title: s.title ?? null }, s.label),
      h('dd', { class: s.words ? null : 't-mono' }, s.value)))));
}
