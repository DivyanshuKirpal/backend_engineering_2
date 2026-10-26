// useOAuthCallbackPresenter (section 5, OAuthCallbackPage): where Google
// sends people back. It reads ?error= or #ticket= once, then clears them from
// the address bar (section 1). Static phase: Google sign-in needs the server,
// so the page shows any error, says that, and points to logging in by email.

import { session } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { tidyAddress } from '../shared/navigation.js';

const ERRORS = {
  access_denied: 'You cancelled the Google sign-in, so nothing changed.',
  invalid_state: 'The sign-in took too long or started in another tab. Start it again.',
  email_not_verified: 'Google hasn\'t verified that email address, so it can\'t be linked to an Orichal account.',
};
// Only a short code is repeated back; anything else in the address is ignored
const CODE = /^[a-z0-9_.-]{1,60}$/i;

function errorText(code) {
  if (code == null || code === '') return null;
  if (ERRORS[code]) return ERRORS[code];
  return CODE.test(code) ? `Google sign-in didn't work (${code}).` : 'Google sign-in didn\'t work.';
}

export function createOAuthCallbackPresenter({ error, hash = '', path = '/oauth/callback' }) {
  const p = createPresenter();
  const message = errorText(error);
  const ticket = new URLSearchParams(String(hash).replace(/^#/, '')).has('ticket');
  if (error != null || hash) tidyAddress(path);
  p.own(session.subscribe(() => p.changed()));

  return {
    get vm() {
      const user = session.get().user;
      return {
        title: message ? 'Google sign-in didn\'t work' : 'Google sign-in isn\'t ready yet',
        error: message,
        body: [
          'Signing in with Google needs the server, which comes with the backend. Until then, log in with an email and password, or with a demo account.',
          ticket ? 'Google asked for this account\'s two-factor code. That step finishes on the server too.' : null,
        ].filter(Boolean),
        note: user ? `You're signed in as ${user.displayName}.` : null,
        actions: user
          ? [{ key: 'markets', label: 'Go to markets', href: '/markets', primary: true }]
          : [
            { key: 'login', label: 'Log in with email', href: '/login', primary: true },
            { key: 'register', label: 'Create a demo account', href: '/register', primary: false },
          ],
      };
    },
    actions: {},
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
