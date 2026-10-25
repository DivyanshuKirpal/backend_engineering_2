// MarketTable, MarketRow and WatchlistStar (section 5; Markets board).
// Sortable columns are buttons in their headers with aria-sort.

import { h, cx } from '../../dom.js';
import { Icon } from '../ui/Icon.js';
import { AssetIcon } from './AssetIcon.js';
import { PriceChange } from './PriceChange.js';
import { StatusMarker } from '../ui/StatusMarker.js';

function SortHeader(label, key, sort, onSort, className) {
  return h('th', { scope: 'col', class: cx({ num: !className.includes('col-left') }, className), 'aria-sort': sort[key] },
    h('button', { type: 'button', class: 'sort-btn', onClick: () => onSort(key) },
      label,
      h('span', { class: 'sort-mark', 'aria-hidden': 'true' }, sort[key] === 'ascending' ? '▲' : sort[key] === 'descending' ? '▼' : '')));
}

export function WatchlistStar(row, onToggle) {
  return h('button', {
    type: 'button',
    class: cx('star-btn', { starred: row.starred }),
    'aria-pressed': String(row.starred),
    'aria-label': row.starLabel,
    onClick: () => onToggle(row.symbol),
  }, Icon(row.starred ? 'star-filled' : 'star', { size: 18 }));
}

function MarketRow(r, actions) {
  return h('tr', { key: r.key, class: cx('market-row', { halted: r.halted }) },
    h('td', { class: 'col-star' }, WatchlistStar(r, actions.toggleStar)),
    h('th', { scope: 'row', class: 'col-market' },
      h('a', { class: 'market-link', href: r.href },
        AssetIcon(r.tile),
        h('span', { class: 'market-names' },
          h('span', { class: 'market-pair' }, r.pair),
          h('span', { class: 'market-name' }, r.name)))),
    h('td', { class: 'num col-last t-mono' }, r.last),
    h('td', { class: 'col-change' }, PriceChange(r.change)),
    h('td', { class: 'num col-high t-mono' }, r.high),
    h('td', { class: 'num col-low t-mono' }, r.low),
    h('td', { class: 'num col-volume' },
      h('span', { class: 'volume-quote t-mono' }, r.quoteVolume),
      h('span', { class: 'volume-base t-mono' }, r.baseVolume)),
    h('td', { class: 'col-status' }, StatusMarker(r.status, { size: 'sm' })),
    h('td', { class: 'col-action' },
      h('a', { class: r.halted ? 'btn btn-quiet btn-row' : 'btn btn-secondary btn-row', href: r.href, 'aria-label': `${r.action} ${r.pair}` }, r.action)));
}

export function MarketTable(vm, actions) {
  return h('div', { class: 'table-wrap market-table-wrap' },
    h('table', { class: 'table market-table' },
      h('caption', { class: 'sr-only' }, 'Markets, with live prices. Sort by a column with its header.'),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'col-star' }, h('span', { class: 'sr-only' }, 'Watchlist')),
        h('th', { scope: 'col', class: 'col-market' }, 'Market'),
        SortHeader('Last price', 'last', vm.sort, actions.sortBy, 'col-last'),
        SortHeader('24h change', 'change', vm.sort, actions.sortBy, 'col-change col-left'),
        SortHeader('24h high', 'high', vm.sort, actions.sortBy, 'col-high'),
        SortHeader('24h low', 'low', vm.sort, actions.sortBy, 'col-low'),
        SortHeader('24h volume', 'volume', vm.sort, actions.sortBy, 'col-volume'),
        h('th', { scope: 'col', class: 'col-status' }, 'Status'),
        h('th', { scope: 'col', class: 'col-action' }, h('span', { class: 'sr-only' }, 'Trade')))),
      h('tbody', {}, vm.rows.map((r) => MarketRow(r, actions)))));
}
