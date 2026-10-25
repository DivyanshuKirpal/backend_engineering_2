// AssetIcon (section 5): the lettered tile that stands in for
// /coins/*.svg (section 7, Open items). The colour comes from the asset's
// identity token in tokens.css; the letter is the tile's text.

import { h, cx } from '../../dom.js';

/** vm: { code, letter } from the presenter. */
export function AssetIcon({ code, letter }, { size = 'md' } = {}) {
  return h('span', { class: cx('asset-tile', `asset-${String(code).toLowerCase()}`, `asset-tile-${size}`), 'aria-hidden': 'true' }, letter);
}
