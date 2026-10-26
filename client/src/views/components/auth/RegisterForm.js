// RegisterForm (section 5, RegisterPage; board Register): display name,
// email, password with the strength meter, the tick for the Terms and the Risk
// notice, Create account, then Google below a rule.

import { h } from '../../dom.js';
import { Field, Checkbox } from '../ui/Field.js';
import { GoogleButton, OrRule, PasswordField, PasswordStrengthMeter } from './AuthParts.js';

export function RegisterForm(vm, actions) {
  const e = vm.errors;
  return h('section', { class: 'auth-card auth-card-wide', 'aria-labelledby': 'auth-title' },
    h('h1', { class: 'auth-title', id: 'auth-title' }, 'Create a demo account'),
    h('p', { class: 'auth-sub' }, 'Already have one? ', h('a', { class: 'link', href: vm.loginHref }, 'Log in')),
    h('form', {
      class: 'auth-form',
      novalidate: true,
      'aria-describedby': e.form ? 'register-error' : null,
      onSubmit: (ev) => {
        ev.preventDefault();
        actions.submit();
      },
    },
    e.form ? h('p', { class: 'auth-error', id: 'register-error', role: 'alert' }, e.form) : null,
    Field({ id: 'register-name', label: 'Display name', value: vm.displayName, autocomplete: 'nickname', maxlength: 40, error: e.displayName, onInput: actions.setDisplayName }),
    Field({ id: 'register-email', label: 'Email', type: 'email', value: vm.email, autocomplete: 'email', inputmode: 'email', error: e.email, onInput: actions.setEmail }),
    h('div', { class: 'auth-password' },
      PasswordField({
        id: 'register-password', value: vm.password, show: vm.showPassword, autocomplete: 'new-password',
        error: e.password, onInput: actions.setPassword, onToggle: actions.toggleShow, describedBy: 'register-password-strength',
      }),
      PasswordStrengthMeter(vm.meter, { id: 'register-password-strength' })),
    Checkbox({
      id: 'register-agree',
      checked: vm.agreed,
      error: e.agreed,
      onChange: actions.setAgreed,
      children: [
        'I\'ve read the ',
        h('a', { class: 'link', href: '/legal/terms', target: '_blank', rel: 'noopener' }, 'Terms'),
        ' and the ',
        h('a', { class: 'link', href: '/legal/risk', target: '_blank', rel: 'noopener' }, 'Risk notice'),
        ', and I understand Orichal is a simulated exchange.',
      ],
    }),
    h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block auth-submit', disabled: vm.busy, 'aria-busy': vm.busy ? 'true' : null }, vm.busy ? 'Creating…' : 'Create account')),
    OrRule(),
    GoogleButton({ label: 'Sign up with Google', onClick: actions.google }));
}
