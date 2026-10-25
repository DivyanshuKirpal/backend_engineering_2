// Route guards (section 1: GuestRoute, ProtectedRoute, AdminRoute). They read
// only the session status the session presenter has restored.

import { sessionState } from '/src/presenters/shared/session.presenter.js';

/** Returns null to allow the route, or { redirect, message? }. */
export function guard(route, url) {
  const { status, isAdmin } = sessionState();
  const here = url.pathname + url.search;
  if (route.access === 'guest' && status === 'user') return { redirect: '/markets' };
  if ((route.access === 'user' || route.access === 'admin') && status !== 'user') {
    return { redirect: `/login?next=${encodeURIComponent(here)}` };
  }
  if (route.access === 'admin' && !isAdmin) {
    return { redirect: '/markets', message: 'That page is for admins only.' };
  }
  return null;
}
