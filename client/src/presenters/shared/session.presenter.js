// useSessionPresenter (section 1): restores the session once per page load,
// applies the theme, connects the socket and loads what every page shares
// (markets for everyone; balances and notifications once signed in). The
// router's guards read only the resulting status.

import * as authApi from '../../models/api/auth.api.js';
import * as userApi from '../../models/api/user.api.js';
import { setAccessToken } from '../../models/api/http.js';
import { session, signIn, signOut, setUser } from '../../models/stores/session.store.js';
import { preferences, setPreferences } from '../../models/stores/preferences.store.js';
import { loadBalances, clearBalances } from '../../models/stores/balance.store.js';
import { loadMarkets } from '../../models/stores/ticker.store.js';
import { loadNotifications, clearNotifications } from '../../models/stores/notification.store.js';
import { socket } from '../../models/realtime/socket.js';

let restoring = null;

/** Light is the only drawn theme (section 7); a saved "dark" falls back to it. */
export function applyTheme() {
  document.documentElement.dataset.theme = preferences.get().theme === 'dark' ? 'dark' : 'light';
}

export function restoreSession() {
  restoring ??= (async () => {
    applyTheme();
    loadMarkets();
    try {
      const { accessToken } = await authApi.refresh();
      setAccessToken(accessToken);
      const { user } = await userApi.me();
      startUser({ user, accessToken });
    } catch {
      signOut({ broadcast: false });
    }
  })();
  return restoring;
}

/** After login, 2FA or registration: the user's own preferences win. */
export function startUser({ user, accessToken }) {
  signIn({ user, accessToken });
  setPreferences({ theme: user.preferences.theme, hideSmallBalances: user.preferences.hideSmallBalances });
  applyTheme();
  loadBalances();
  loadNotifications();
}

export async function endUser() {
  try {
    await authApi.logout();
  } catch {
    // The session ends on this page either way.
  }
  signOut();
  clearBalances();
  clearNotifications();
}

/** Re-reads the user, e.g. after the email is confirmed. */
export async function refreshUser() {
  if (session.get().status !== 'user') return;
  try {
    const { user } = await userApi.me();
    setUser(user);
  } catch {
    // Keep what we have; the next page load restores again.
  }
}

export const sessionState = () => {
  const { status, user } = session.get();
  return { status, isAdmin: user?.role === 'admin' };
};

export const onSessionChange = (fn) => session.subscribe(fn);

// The mock server confirms an email a moment after "Resend link"; the
// notification is the cue to read the user again.
socket.on('notification', ({ notification }) => {
  if (notification.type === 'security' || notification.type === 'kyc') refreshUser();
});
