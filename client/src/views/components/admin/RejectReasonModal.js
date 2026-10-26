// RejectReasonModal (section 5): turning something down with the reason the
// person will see, typed or picked from a few common ones. KYC review and
// withdrawals both use it. Not drawn yet: it follows the confirm dialog.

import { h } from '../../dom.js';
import { Modal } from '../ui/Overlay.js';
import { Field } from '../ui/Field.js';

/** r: { title, hint, reason, error, busy, suggestions: [string] } */
export function RejectReasonModal(r, { onInput, onConfirm, onCancel }) {
  return Modal({ title: r.title, titleId: 'reject-title', onClose: onCancel, className: 'reject-dialog' },
    h('form', {
      class: 'dialog-form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        onConfirm();
      },
    },
    h('div', { class: 'dialog-body' },
      h('div', { ref: (el) => { if (!el.__focused) { el.__focused = true; requestAnimationFrame(() => el.querySelector('input')?.focus()); } } },
        Field({ id: 'reject-reason', label: 'Reason', value: r.reason, error: r.error, hint: r.hint, autocomplete: 'off', maxlength: 200, disabled: r.busy, onInput })),
      r.suggestions?.length
        ? h('div', { class: 'reject-suggestions', role: 'group', 'aria-label': 'Common reasons' },
          r.suggestions.map((s) => h('button', { key: s, type: 'button', class: 'btn btn-quiet btn-xs', onClick: () => onInput(s) }, s)))
        : null),
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: onCancel }, 'Keep reviewing'),
      h('button', { type: 'submit', class: 'btn btn-danger-outline', disabled: r.busy }, r.busy ? 'Rejecting…' : 'Reject'))));
}
