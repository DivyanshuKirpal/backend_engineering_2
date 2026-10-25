// MarketStatusBanner (section 5; UI kit): an ink bar with a brass pause mark,
// shown while a market is halted.

import { h } from '../../dom.js';
import { Icon } from '../ui/Icon.js';

/** vm: { pair } or null. */
export function MarketStatusBanner(vm) {
  if (!vm) return null;
  return h('div', { class: 'market-banner', role: 'status' },
    Icon('pause', { size: 16, className: 'market-banner-icon' }),
    h('p', {}, h('strong', {}, `${vm.pair} is halted. `), 'New orders are paused. You can still cancel the ones you have open.'));
}
