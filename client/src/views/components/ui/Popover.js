// Popover helpers shared by the header menus and the market switcher: a
// see-through backdrop that closes the popover when you click away, and a ref
// that moves focus into the popover once, when it opens.

import { h } from '../../dom.js';

export function PopoverBackdrop(onClose) {
  return h('button', { class: 'popover-backdrop', type: 'button', tabindex: '-1', 'aria-hidden': 'true', onClick: onClose });
}

export function focusFirst(el) {
  if (el.__focused) return;
  el.__focused = true;
  el.querySelector('input, a, button:not([disabled])')?.focus();
}
