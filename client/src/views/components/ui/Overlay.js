// Drawer, Modal and ConfirmDialog (section 5). Each is a real dialog: it
// takes focus when it opens, keeps Tab inside, closes on Escape or the
// backdrop, and gives focus back to whatever opened it.

import { h, cx } from '../../dom.js';
import { Icon } from './Icon.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trap(e, onClose) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    onClose();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...e.currentTarget.querySelectorAll(FOCUSABLE)];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Remembers what had focus, moves focus in once, and gives it back on close. */
function focusIn(panel) {
  if (panel.__opened) return;
  panel.__opened = true;
  const previous = document.activeElement;
  (panel.querySelector('[data-autofocus]') ?? panel.querySelector('.dialog-title') ?? panel).focus({ preventScroll: true });
  const observer = new MutationObserver(() => {
    if (!panel.isConnected) {
      observer.disconnect();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function Dialog({ kind, title, titleId, onClose, className = '', labelExtra = null, closeLabel = 'Close' }, children) {
  return h('div', { class: cx('overlay', `overlay-${kind}`) },
    h('div', { class: 'overlay-scrim', 'aria-hidden': 'true', onClick: onClose }),
    h('div', {
      class: cx('dialog', `dialog-${kind}`, className),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: '-1',
      ref: focusIn,
      onKeyDown: (e) => trap(e, onClose),
    },
    h('div', { class: 'dialog-head' },
      h('h2', { class: 'dialog-title', id: titleId, tabindex: '-1' }, title, labelExtra),
      h('button', { type: 'button', class: 'dialog-close', 'aria-label': closeLabel, onClick: onClose }, Icon('cross', { size: 18 }))),
    children));
}

export const Drawer = (props, ...children) => Dialog({ ...props, kind: 'drawer' }, children);
export const Modal = (props, ...children) => Dialog({ ...props, kind: 'modal' }, children);

/** A yes-or-no question. `tone: 'danger'` draws the confirm button outlined in red. */
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Keep it', tone = 'primary', busy = false, onConfirm, onCancel, titleId = 'confirm-title', children = null }) {
  return Modal({ title, titleId, onClose: onCancel, className: 'dialog-confirm' },
    h('div', { class: 'dialog-body' },
      body ? h('p', {}, body) : null,
      children),
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: onCancel }, cancelLabel),
      h('button', {
        type: 'button',
        class: tone === 'danger' ? 'btn btn-danger-outline' : tone === 'buy' ? 'btn btn-buy' : 'btn btn-primary',
        disabled: busy,
        'data-autofocus': true,
        onClick: onConfirm,
      }, busy ? 'Working…' : confirmLabel)));
}
