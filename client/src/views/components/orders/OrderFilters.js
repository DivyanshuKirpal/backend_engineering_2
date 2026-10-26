// OrderFilters (section 5): the market and side selects above the orders
// tables, in the inline style the History page's filters use.

import { h } from '../../dom.js';
import { Select } from '../ui/Field.js';

/** filters: { market, marketOptions, side, sideOptions }. */
export function OrderFilters(filters, { onMarket, onSide }) {
  return h('div', { class: 'orders-filters' },
    Select({ id: 'orders-market', label: 'Market', value: filters.market, options: filters.marketOptions, onChange: onMarket, inline: true }),
    Select({ id: 'orders-side', label: 'Side', value: filters.side, options: filters.sideOptions, onChange: onSide, inline: true }));
}
