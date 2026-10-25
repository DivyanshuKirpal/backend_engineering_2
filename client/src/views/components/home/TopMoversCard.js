// TopMoversCard (section 5): one of the three cards under "The last 24 hours":
// gainers and losers with price and change, or the most traded by volume.

import { h } from '../../dom.js';
import { AssetIcon } from '../market/AssetIcon.js';
import { PriceChange } from '../market/PriceChange.js';

export function TopMoversCard({ id, label, rows, kind, empty }) {
  return h('section', { class: 'movers-card panel', 'aria-labelledby': id },
    h('h3', { class: 'panel-label movers-label', id }, label),
    rows.length ? h('ul', { class: 'plain movers-list' }, rows.map((r) => h('li', { key: r.key },
      h('a', { class: 'movers-row', href: r.href },
        AssetIcon(r.tile, { size: 'sm' }),
        h('span', { class: 'movers-pair' }, r.pair),
        kind === 'volume'
          ? [h('span', { class: 'movers-figure t-mono' }, r.volume), h('span', { class: 'movers-unit' }, 'USDT')]
          : [h('span', { class: 'movers-figure t-mono' }, r.price), PriceChange(r.change, { className: 'movers-change' })]))))
      : h('p', { class: 'movers-empty' }, empty));
}
