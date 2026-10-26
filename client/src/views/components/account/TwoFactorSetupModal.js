// TwoFactorSetupModal (section 5): turning two-factor on (scan the QR code or
// type the key, then enter a code) or off (the password and a code). Not
// drawn yet: they follow the confirm dialog and the login code step.

import { h } from '../../dom.js';
import { Modal } from '../ui/Overlay.js';
import { Field } from '../ui/Field.js';
import { OtpInput } from '../ui/OtpInput.js';
import { QrCode } from '../ui/QrCode.js';
import { CopyButton } from '../ui/CopyButton.js';
import { Skeleton, ErrorState } from '../ui/EmptyState.js';

function CodeInput(d, actions) {
  return OtpInput({
    id: 'twofa-code',
    label: 'Code from your app',
    value: d.code,
    error: d.codeError,
    disabled: d.busy,
    onInput: actions.setCode,
    hint: [h('span', {}, d.demoHint), ' ', h('button', { type: 'button', class: 'link', onClick: actions.useDemoCode }, 'Use the demo code')],
  });
}

/** d: the security presenter's dialog vm. */
export function TwoFactorSetupModal(d, actions) {
  let body;
  if (d.mode === 'enable') {
    let setup;
    if (d.failed) setup = ErrorState({ title: 'Setup didn\'t start', body: 'Check the connection and try again.', onRetry: actions.retrySetup });
    else if (d.loading) setup = Skeleton({ lines: 4, label: 'Making your key' });
    else {
      setup = h('div', { class: 'twofa-setup' },
        QrCode({ text: d.qr, size: 132, label: 'QR code for your authenticator app' }),
        h('div', { class: 'twofa-key' },
          h('p', { class: 'field-label' }, 'Or type this key'),
          h('p', { class: 'twofa-key-value t-mono' }, d.manualKey, ' ', CopyButton({ value: d.manualKey.replace(/\s/g, ''), iconOnly: true, label: 'Copy the key' }))));
    }
    body = [
      h('p', {}, 'Scan the code with an authenticator app, then enter the six digits it shows.'),
      setup,
      d.loading || d.failed ? null : CodeInput(d, actions),
    ];
  } else {
    body = [
      h('p', {}, d.body),
      d.askPassword
        ? Field({ id: 'twofa-password', label: 'Password', type: 'password', value: d.password, error: d.passwordError, autocomplete: 'current-password', disabled: d.busy, onInput: actions.setDialogPassword })
        : null,
      CodeInput(d, actions),
    ];
  }

  return Modal({ title: d.title, titleId: 'twofa-dialog-title', onClose: actions.closeTwoFactor, className: 'twofa-dialog' },
    h('form', {
      class: 'dialog-form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        actions.confirmTwoFactor();
      },
    },
    h('div', { class: 'dialog-body' }, body),
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: actions.closeTwoFactor }, d.mode === 'enable' ? 'Not now' : 'Keep it on'),
      h('button', {
        type: 'submit',
        class: d.mode === 'enable' ? 'btn btn-primary' : 'btn btn-danger-outline',
        disabled: d.busy || (d.mode === 'enable' && (d.loading || d.failed)),
      }, d.busy ? 'Checking…' : d.confirm))));
}
