// CopyButton (section 5). Copying text is a browser action with no data
// change, so the button does it itself and shows "Copied" for a moment.

import { h, cx } from '../../dom.js';
import { Icon } from './Icon.js';

export function CopyButton({ value, label = 'Copy', iconOnly = false, className = '' }) {
  const copy = async (e) => {
    const button = e.currentTarget;
    try {
      await navigator.clipboard.writeText(value);
      button.dataset.copied = 'true';
      button.querySelector('.copy-text')?.replaceChildren('Copied');
      button.setAttribute('aria-label', 'Copied');
      setTimeout(() => {
        delete button.dataset.copied;
        button.querySelector('.copy-text')?.replaceChildren(label);
        button.setAttribute('aria-label', iconOnly ? `${label} ${value}` : label);
      }, 1600);
    } catch {
      button.querySelector('.copy-text')?.replaceChildren('Select it to copy');
    }
  };
  return h('button', {
    type: 'button',
    class: cx('copy-btn', { 'copy-icon-only': iconOnly }, className),
    'aria-label': iconOnly ? `${label} ${value}` : label,
    onClick: copy,
  }, Icon('copy', { size: 14 }), iconOnly ? h('span', { class: 'copy-text sr-only' }, label) : h('span', { class: 'copy-text' }, label));
}
