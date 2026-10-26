// TwoFactorPrompt (section 5; board Log in · 2FA code): the six-digit code,
// the tries left on the ticket, and a way back to a different account. The
// OAuth callback page uses it too, once Google sign-in exists.

import { h } from '../../dom.js';
import { OtpInput } from '../ui/OtpInput.js';

/** Puts the caret in the code field once, when the step opens. */
const focusOnce = (el) => {
  if (el.__focused) return;
  el.__focused = true;
  requestAnimationFrame(() => el.focus({ preventScroll: true }));
};

/** vm: { code, codeError, attempts, signingInAs, busy }. */
export function TwoFactorPrompt(vm, actions) {
  return h('section', { class: 'auth-card auth-card-code', 'aria-labelledby': 'auth-title' },
    h('h1', { class: 'auth-title', id: 'auth-title' }, 'Enter your code'),
    h('p', { class: 'auth-sub auth-sub-long' },
      'Open your authenticator app and type the 6-digit code for Orichal. Signing in as ',
      h('strong', {}, vm.signingInAs), '.'),
    h('form', {
      class: 'auth-form',
      novalidate: true,
      onSubmit: (ev) => {
        ev.preventDefault();
        actions.submitCode();
      },
    },
    h('div', { class: 'otp-lg', ref: (el) => focusOnce(el.querySelector('input')) },
      OtpInput({
        id: 'login-code',
        label: 'Authenticator code',
        value: vm.code,
        error: vm.codeError,
        disabled: vm.busy,
        onInput: actions.setCode,
        hint: [h('span', {}, vm.attempts), h('span', {}, 'Paste works too')],
      })),
    h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block auth-submit', disabled: vm.busy || vm.code.length !== 6 }, vm.busy ? 'Checking…' : 'Verify and log in')),
    h('p', { class: 'auth-switch' }, 'Not you? ', h('button', { type: 'button', class: 'link', onClick: actions.differentAccount }, 'Use a different account')));
}
