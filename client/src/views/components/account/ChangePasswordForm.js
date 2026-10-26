// ChangePasswordForm (section 5; board Account · Security): the current
// password, the new one with its strength meter, and the new one again.

import { h } from '../../dom.js';
import { Panel } from '../ui/Panel.js';
import { Field } from '../ui/Field.js';
import { PasswordStrengthMeter } from '../auth/AuthParts.js';

/** pw: { current, next, repeat, errors, meter, busy }. */
export function ChangePasswordForm(pw, actions) {
  return Panel({
    as: 'form',
    label: 'Change password',
    labelId: 'change-password-label',
    className: 'password-panel',
    onSubmit: (e) => {
      e.preventDefault();
      actions.changePassword();
    },
    foot: [
      h('p', { class: 'panel-foot-note' }, 'Changing it signs you out on every other device.'),
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: pw.busy }, pw.busy ? 'Changing…' : 'Change password'),
    ],
  },
  h('div', { class: 'password-grid' },
    Field({ id: 'pw-current', label: 'Current password', type: 'password', value: pw.current, error: pw.errors.current, autocomplete: 'current-password', onInput: actions.setCurrent }),
    h('div', { class: 'password-new' },
      Field({ id: 'pw-new', label: 'New password', type: 'password', value: pw.next, error: pw.errors.next, autocomplete: 'new-password', describedBy: 'pw-new-strength', onInput: actions.setNext }),
      PasswordStrengthMeter(pw.meter, { id: 'pw-new-strength' })),
    Field({ id: 'pw-repeat', label: 'Repeat new password', type: 'password', value: pw.repeat, error: pw.errors.repeat, autocomplete: 'new-password', onInput: actions.setRepeat })));
}
