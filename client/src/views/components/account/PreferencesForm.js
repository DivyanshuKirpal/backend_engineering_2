// PreferencesForm (section 5; board Account · Profile, "Preferences"): the
// theme and hiding small balances, saved together.

import { h } from '../../dom.js';
import { Panel } from '../ui/Panel.js';
import { Select, Checkbox } from '../ui/Field.js';

/** prefs: { theme, themeOptions, hideSmall, saving }. */
export function PreferencesForm(prefs, actions) {
  return Panel({
    as: 'form',
    label: 'Preferences',
    labelId: 'profile-prefs-label',
    className: 'prefs-panel',
    onSubmit: (e) => {
      e.preventDefault();
      actions.savePrefs();
    },
    foot: h('button', { type: 'submit', class: 'btn btn-primary', disabled: prefs.saving }, prefs.saving ? 'Saving…' : 'Save preferences'),
  },
  Select({ id: 'prefs-theme', label: 'Theme', value: prefs.theme, options: prefs.themeOptions, onChange: actions.setTheme }),
  Checkbox({
    id: 'prefs-hide-small',
    label: 'Hide small balances',
    checked: prefs.hideSmall,
    hint: 'Assets worth less than 1 USDT drop out of the wallet table.',
    onChange: actions.setHideSmall,
  }));
}
