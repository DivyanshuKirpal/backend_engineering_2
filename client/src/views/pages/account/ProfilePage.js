// ProfilePage (section 5; board Account · Profile): the profile and the
// preferences, each saved on its own.

import { h, render } from '../../dom.js';
import { createProfilePresenter } from '/src/presenters/account/profile.presenter.js';
import { Skeleton } from '../../components/ui/EmptyState.js';
import { ProfileForm } from '../../components/account/ProfileForm.js';
import { PreferencesForm } from '../../components/account/PreferencesForm.js';

export const styles = ['/styles/pages/account.css'];
export const title = () => 'Profile';

function ProfileView(vm, actions) {
  return h('div', { class: 'account-page profile-page' },
    h('h1', { class: 't-title' }, 'Profile'),
    vm.status === 'ready'
      ? [ProfileForm(vm, actions), PreferencesForm(vm.prefs, actions)]
      : Skeleton({ lines: 6, label: 'Loading your profile' }));
}

export function mount(outlet) {
  const presenter = createProfilePresenter();
  const draw = () => render(outlet, ProfileView(presenter.vm, presenter.actions));
  draw();
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    render(outlet);
  };
}
