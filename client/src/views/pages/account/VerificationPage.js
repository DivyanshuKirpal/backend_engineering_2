// VerificationPage (section 5; board Account · Verification): the identity
// check's status and steps, then the form, or what was sent.

import { h, render } from '../../dom.js';
import { createVerificationPresenter } from '/src/presenters/account/verification.presenter.js';
import { Skeleton, ErrorState } from '../../components/ui/EmptyState.js';
import { KycStatusPanel } from '../../components/account/KycStatusCard.js';
import { KycForm, KycApplication } from '../../components/account/KycForm.js';

export const styles = ['/styles/pages/account.css'];
export const title = () => 'Verification';

function VerificationView(vm, actions) {
  let body;
  if (vm.status === 'error') body = ErrorState({ title: 'Your identity check didn\'t load', body: 'Check the connection and try again.', onRetry: actions.retry });
  else if (vm.status !== 'ready') body = Skeleton({ lines: 8, label: 'Loading' });
  else {
    body = [
      KycStatusPanel(vm),
      vm.form ? KycForm(vm.form, actions) : null,
      vm.application ? KycApplication(vm.application) : null,
    ];
  }
  return h('div', { class: 'account-page verification-page' },
    h('h1', { class: 't-title' }, 'Verification'),
    h('p', { class: 'account-intro' }, 'Withdrawals open once an admin approves your identity check. Orichal is a simulator, so use a sample document, not your real ID.'),
    body);
}

export function mount(outlet) {
  const presenter = createVerificationPresenter();
  const draw = () => render(outlet, VerificationView(presenter.vm, presenter.actions));
  draw();
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    render(outlet);
  };
}
