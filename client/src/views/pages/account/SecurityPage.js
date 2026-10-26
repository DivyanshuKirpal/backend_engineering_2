// SecurityPage (section 5; board Account · Security): two-factor, changing
// the password, the signed-in devices and recent activity.

import { h, render } from '../../dom.js';
import { createSecurityPresenter } from '/src/presenters/account/security.presenter.js';
import { Panel } from '../../components/ui/Panel.js';
import { Skeleton } from '../../components/ui/EmptyState.js';
import { TwoFactorCard } from '../../components/account/TwoFactorCard.js';
import { TwoFactorSetupModal } from '../../components/account/TwoFactorSetupModal.js';
import { ChangePasswordForm } from '../../components/account/ChangePasswordForm.js';
import { SessionList } from '../../components/account/SessionList.js';
import { ActivityTable } from '../../components/account/ActivityTable.js';

export const styles = ['/styles/pages/account.css'];
export const title = () => 'Security';

function SecurityView(vm, actions) {
  if (vm.status !== 'ready') {
    return h('div', { class: 'account-page security-page' }, h('h1', { class: 't-title' }, 'Security'), Skeleton({ lines: 8, label: 'Loading' }));
  }
  return h('div', { class: 'account-page security-page' },
    h('h1', { class: 't-title' }, 'Security'),
    TwoFactorCard(vm.twoFactor, actions),
    vm.password
      ? ChangePasswordForm(vm.password, actions)
      : Panel({ label: 'Change password', labelId: 'change-password-label' }, h('p', { class: 'panel-note' }, 'You sign in with Google, so there\'s no password here to change.')),
    SessionList(vm.devices, actions),
    ActivityTable(vm.activity, actions),
    vm.dialog ? TwoFactorSetupModal(vm.dialog, actions) : null);
}

export function mount(outlet) {
  const presenter = createSecurityPresenter();
  const draw = () => render(outlet, SecurityView(presenter.vm, presenter.actions));
  draw();
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    render(outlet);
  };
}
