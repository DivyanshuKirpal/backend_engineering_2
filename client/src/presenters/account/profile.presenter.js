// useProfilePresenter (section 5, ProfilePage): the display name, saved with
// PATCH /users/me; the email and whether it is confirmed, Google sign-in and
// the join date; and the preferences (theme, hide small balances), saved to
// the account and to this browser. Light is the only theme drawn so far.

import * as userApi from '../../models/api/user.api.js';
import { session, setUser } from '../../models/stores/session.store.js';
import { preferences, setPreferences } from '../../models/stores/preferences.store.js';
import { createPresenter } from '../shared/presenter.js';
import { applyTheme } from '../shared/session.presenter.js';
import { toast, errorToast } from '../shared/toasts.js';
import { fullDate } from '../formatters/date.format.js';

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark (not designed yet)', disabled: true },
];

function nameProblem(value) {
  const name = value.trim();
  if (!name) return 'Enter a display name.';
  if (name.length < 2 || name.length > 40) return 'Display names are 2 to 40 characters.';
  return null;
}

export function createProfilePresenter() {
  const p = createPresenter();
  const user = () => session.get().user;
  let name = user()?.displayName ?? '';
  let nameError = null;
  let savingName = false;
  let theme = preferences.get().theme === 'dark' ? 'dark' : 'light';
  let hideSmall = preferences.get().hideSmallBalances;
  let savingPrefs = false;

  p.own(session.subscribe(() => p.changed()));

  return {
    get vm() {
      const u = user();
      if (!u) return { status: 'loading' };
      return {
        status: 'ready',
        name: {
          value: name,
          error: nameError,
          hint: 'Shown in the header and in notifications. Not visible to other traders.',
          saving: savingName,
        },
        email: u.email,
        emailStatus: u.emailVerified
          ? { label: 'Confirmed', marker: 'tag', tone: 'buy' }
          : { label: 'Not confirmed', marker: 'tag', tone: 'wait' },
        google: u.googleLinked ? 'Linked' : 'Not linked',
        since: fullDate(u.createdAt),
        prefs: { theme, themeOptions: THEMES, hideSmall, saving: savingPrefs },
      };
    },
    actions: {
      setName(value) {
        name = value;
        if (nameError) nameError = nameProblem(name);
        p.changed();
      },
      discard() {
        name = user()?.displayName ?? '';
        nameError = null;
        p.changed();
      },
      async saveName() {
        if (savingName) return;
        nameError = nameProblem(name);
        if (nameError) {
          p.changed();
          return;
        }
        savingName = true;
        p.changed();
        try {
          const result = await userApi.updateMe({ displayName: name.trim() });
          setUser(result.user);
          name = result.user.displayName;
          toast({ title: 'Profile saved', body: `You show as ${result.user.displayName}.`, tone: 'success' });
        } catch (err) {
          if (err?.details?.displayName) nameError = err.message;
          else errorToast('Your profile wasn\'t saved', err);
        } finally {
          savingName = false;
          p.changed();
        }
      },
      setTheme(value) {
        theme = value;
        p.changed();
      },
      setHideSmall(on) {
        hideSmall = Boolean(on);
        p.changed();
      },
      async savePrefs() {
        if (savingPrefs) return;
        const before = preferences.get();
        savingPrefs = true;
        setPreferences({ theme, hideSmallBalances: hideSmall });
        applyTheme();
        p.changed();
        try {
          const result = await userApi.updateMe({ preferences: { theme, hideSmallBalances: hideSmall } });
          setUser(result.user);
          toast({ title: 'Preferences saved', body: hideSmall ? 'The wallet hides assets worth less than 1 USDT.' : 'The wallet shows every asset.', tone: 'success' });
        } catch (err) {
          setPreferences(before);
          applyTheme();
          errorToast('Your preferences weren\'t saved', err);
        } finally {
          savingPrefs = false;
          p.changed();
        }
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
