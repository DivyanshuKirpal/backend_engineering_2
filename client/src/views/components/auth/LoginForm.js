// LoginForm (section 5, LoginPage; board Log in): email, password with its
// Show button and the Forgot password link, Log in, then Google below a rule.

import { h } from '../../dom.js';
import { Field } from '../ui/Field.js';
import { GoogleButton, OrRule, PasswordField } from './AuthParts.js';

export function LoginForm(vm, actions) {
  const e = vm.errors;
  return h('section', { class: 'auth-card', 'aria-labelledby': 'auth-title' },
    h('h1', { class: 'auth-title', id: 'auth-title' }, 'Log in'),
    h('p', { class: 'auth-sub' }, 'New here? ', h('a', { class: 'link', href: vm.registerHref }, 'Create a demo account')),
    h('form', {
      class: 'auth-form',
      novalidate: true,
      'aria-describedby': e.form ? 'login-error' : null,
      onSubmit: (ev) => {
        ev.preventDefault();
        actions.submit();
      },
    },
    e.form ? h('p', { class: 'auth-error', id: 'login-error', role: 'alert' }, e.form) : null,
    Field({
      id: 'login-email', label: 'Email', type: 'email', value: vm.email, autocomplete: 'username', inputmode: 'email',
      error: e.email, onInput: actions.setEmail,
    }),
    PasswordField({
      id: 'login-password', value: vm.password, show: vm.showPassword, autocomplete: 'current-password',
      error: e.password, onInput: actions.setPassword, onToggle: actions.toggleShow,
      labelExtra: h('a', { class: 'link auth-forgot', href: '/forgot-password' }, 'Forgot password?'),
    }),
    h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block auth-submit', disabled: vm.busy, 'aria-busy': vm.busy ? 'true' : null }, vm.busy ? 'Logging in…' : 'Log in')),
    OrRule(),
    GoogleButton({ label: 'Continue with Google', onClick: actions.google }),
    h('p', { class: 'auth-note' }, 'After 5 wrong passwords in a row, sign-in pauses for 15 minutes.'));
}
