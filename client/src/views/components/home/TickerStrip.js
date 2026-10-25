// TickerStrip (section 5): every market's last price and 24h change, live.

import { h } from '../../dom.js';
import { AssetIcon } from '../market/AssetIcon.js';
import { PriceChange } from '../market/PriceChange.js';

export function TickerStrip(items) {
  return h('section', { class: 'ticker-strip', 'aria-label': 'Live prices' }, h('div', { class: 'container' },
    h('ul', { class: 'ticker-strip-list plain' }, items.map((t) => h('li', { key: t.key },
      h('a', { class: 'ticker-cell', href: t.href, 'aria-label': `${t.pair}, ${t.name}, ${t.price}, ${t.change.label}. Trade it.` },
        AssetIcon(t.tile),
        h('span', { class: 'ticker-names', 'aria-hidden': 'true' },
          h('span', { class: 'ticker-pair' }, t.pair),
          h('span', { class: 'ticker-name' }, t.name)),
        h('span', { class: 'ticker-figures', 'aria-hidden': 'true' },
          h('span', { class: 'ticker-price t-mono' }, t.price),
          PriceChange(t.change, { className: 'ticker-change' }))))))));
}
