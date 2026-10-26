// LoginPage (section 5; boards Log in and Log in · 2FA code): the form, then
// the code step when the account has two-factor on. The brand panel's words
// follow the step. A demo sign-in helper sits under the card.

import { h, render } from '../../dom.js';
import { createLoginPresenter } from '/src/presenters/auth/login.presenter.js';
import { LoginForm } from '../../components/auth/LoginForm.js';
import { TwoFactorPrompt } from '../../components/auth/TwoFactorPrompt.js';
import { LoginAside, TwoFactorAside, DemoSignIn } from '../../components/auth/AuthParts.js';

export const styles = ['/styles/pages/auth.css'];
export const title = () => 'Log in';

function LoginView(vm, actions) {
  const coding = vm.step === 'code';
  return h('div', { class: 'auth-stack' },
    coding ? TwoFactorPrompt(vm, actions) : LoginForm(vm, actions),
    DemoSignIn({
      accounts: vm.demo,
      onUse: actions.useDemo,
      code: coding ? vm.demoCode : null,
      onUseCode: actions.useDemoCode,
    }));
}

export function mount(outlet, route, layout) {
  const presenter = createLoginPresenter({ next: route.query.next });
  let step = presenter.vm.step;
  const draw = () => {
    const vm = presenter.vm;
    render(outlet, LoginView(vm, presenter.actions));
    if (layout?.aside) render(layout.aside, vm.step === 'code' ? TwoFactorAside() : LoginAside(vm.facts));
    // Back from the code step: the caret goes to the password, which is now empty.
    if (step === 'code' && vm.step === 'password') outlet.querySelector('#login-password')?.focus();
    step = vm.step;
  };
  draw();
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    if (layout?.aside) render(layout.aside);
    render(outlet);
  };
}
