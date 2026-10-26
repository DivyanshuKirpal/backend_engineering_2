// ProfileForm (section 5; board Account · Profile, "You"): the display name,
// then the email with whether it is confirmed, Google sign-in and the join
// date; Discard and Save changes.

import { h } from '../../dom.js';
import { Panel } from '../ui/Panel.js';
import { Field } from '../ui/Field.js';
import { StatusMarker } from '../ui/StatusMarker.js';

/** vm: the profile presenter's vm. */
export function ProfileForm(vm, actions) {
  const fact = (label, ...value) => h('div', { class: 'profile-fact' }, h('dt', { class: 'field-label' }, label), h('dd', {}, value));
  return Panel({
    as: 'form',
    label: 'You',
    labelId: 'profile-you-label',
    className: 'profile-panel',
    onSubmit: (e) => {
      e.preventDefault();
      actions.saveName();
    },
    foot: [
      h('button', { type: 'button', class: 'btn btn-quiet', onClick: actions.discard }, 'Discard'),
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: vm.name.saving }, vm.name.saving ? 'Saving…' : 'Save changes'),
    ],
  },
  Field({
    id: 'profile-name',
    label: 'Display name',
    value: vm.name.value,
    hint: vm.name.hint,
    error: vm.name.error,
    autocomplete: 'nickname',
    maxlength: 40,
    onInput: actions.setName,
  }),
  h('dl', { class: 'profile-facts' },
    fact('Email', h('span', { class: 'profile-email' }, vm.email), ' ', StatusMarker(vm.emailStatus)),
    fact('Google sign-in', vm.google),
    fact('Member since', vm.since)));
}
