// OrderBook and OrderBookRow (section 5; section 7, Price ladder): prices in
// one cream column down the middle, asks red above and bids green below, size
// bars growing outward, a double rule holding the last price and the spread.
// Your resting amount gets an ink tag in the opposite column. With onPick,
// each price is a button that copies it into the order ticket. The roles are
// spelled out, so the trade page can lay the table out as a flexible ladder
// (asks held to the middle, bids from it) without losing table semantics.

import { h, cx } from '../../dom.js';

function Tag(text) {
  return text ? h('span', { class: 'ladder-tag' }, text) : null;
}

function Row(r, onPick) {
  const sizeCell = h('span', { class: 'ladder-size' },
    h('span', { class: 'ladder-bar', style: { width: `${r.bar}%` }, 'aria-hidden': 'true' }),
    h('span', { class: 'ladder-size-text t-mono' }, r.size));
  const price = onPick
    ? h('button', { type: 'button', class: 'ladder-pick t-mono', 'aria-label': `${r.side === 'ask' ? 'Ask' : 'Bid'} ${r.price}, ${r.size} available. Use this price.`, onClick: () => onPick(r.pick) }, r.price)
    : h('span', { class: 'ladder-price-text t-mono' }, r.price);
  return h('tr', { key: r.key, role: 'row', class: cx('ladder-row', `ladder-row-${r.side}`, { 'ladder-mine': r.mine }) },
    h('td', { role: 'cell', class: 'ladder-bid' }, r.side === 'bid' ? sizeCell : Tag(r.mine)),
    h('td', { role: 'cell', class: 'ladder-price' }, price),
    h('td', { role: 'cell', class: 'ladder-ask' }, r.side === 'ask' ? sizeCell : Tag(r.mine)));
}

/**
 * vm: { asks, bids, middle: { last, arrow, direction, spread: { value, ticks } } }.
 * `caption` names the table for screen readers.
 */
export function OrderBook(vm, { onPick = null, caption, className = '' } = {}) {
  const m = vm.middle;
  return h('table', { class: cx('ladder', className), role: 'table' },
    h('caption', { class: 'sr-only' }, caption),
    h('thead', { role: 'rowgroup' }, h('tr', { role: 'row' },
      h('th', { scope: 'col', role: 'columnheader', class: 'ladder-bid' }, 'Bid size'),
      h('th', { scope: 'col', role: 'columnheader', class: 'ladder-price' }, 'Price'),
      h('th', { scope: 'col', role: 'columnheader', class: 'ladder-ask' }, 'Ask size'))),
    h('tbody', { role: 'rowgroup', class: 'ladder-asks' }, vm.asks.map((r) => Row(r, onPick))),
    h('tbody', { role: 'rowgroup', class: 'ladder-middle' }, h('tr', { role: 'row' },
      h('td', { role: 'cell', class: 'ladder-bid ladder-last-label' }, 'Last ', h('span', { class: `ladder-arrow tone-${m.direction}`, 'aria-label': m.direction === 'up' ? 'up' : 'down' }, m.arrow)),
      h('td', { role: 'cell', class: 'ladder-price ladder-last t-mono' }, m.last),
      h('td', { role: 'cell', class: 'ladder-ask ladder-spread' }, m.spread ? [
        'Spread ', h('span', { class: 'ladder-spread-value t-mono' }, m.spread.value), m.spread.ticks ? ` · ${m.spread.ticks}` : '',
      ] : 'No spread'))),
    h('tbody', { role: 'rowgroup', class: 'ladder-bids' }, vm.bids.map((r) => Row(r, onPick))));
}
