// Tabs (UI kit, "Buttons and tabs"): segmented tabs with counts, underline
// tabs (Limit, Market) and the Buy and Sell toggle. Real tablists: arrow keys
// move between tabs, Home and End jump to the ends.

import { h, cx } from '../../dom.js';

function onArrows(e, items, onSelect) {
  const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
  if (!(e.key in keys)) return;
  e.preventDefault();
  const i = items.findIndex((t) => t.current);
  const step = keys[e.key];
  const next = step === 'first' ? 0 : step === 'last' ? items.length - 1 : (i + step + items.length) % items.length;
  onSelect(items[next].key);
  const list = e.currentTarget.closest('[role="tablist"]');
  requestAnimationFrame(() => list?.querySelectorAll('[role="tab"]')[next]?.focus());
}

/**
 * items: [{ key, label, count?, current, controls? }]. `variant` is 'segment'
 * (Open 4 | History | Trades), 'underline' (Limit, Market) or 'side' (Buy, Sell).
 */
export function Tabs({ items, onSelect, label, variant = 'segment', className = '' }) {
  return h('div', { class: cx('tabs', `tabs-${variant}`, className), role: 'tablist', 'aria-label': label },
    items.map((t) => h('button', {
      key: t.key,
      type: 'button',
      role: 'tab',
      id: t.id ?? null,
      class: cx('tab', t.tone ? `tab-${t.tone}` : null, { current: t.current }),
      'aria-selected': String(Boolean(t.current)),
      'aria-controls': t.controls ?? null,
      tabindex: t.current ? '0' : '-1',
      disabled: t.disabled ?? false,
      onClick: () => onSelect(t.key),
      onKeyDown: (e) => onArrows(e, items, onSelect),
    }, t.label, t.count != null ? h('span', { class: 'tab-count' }, String(t.count)) : null)));
}
