// Who is signed in (section 1, auth.store). Status: unknown while the session
// is being restored, then guest or user. The access token lives in http.js
// memory only. A BroadcastChannel tells other tabs about a logout.

import { createStore } from './createStore.js';
import { setAccessToken } from '../api/http.js';
import { socket } from '../realtime/socket.js';

export const session = createStore({ status: 'unknown', user: null });

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('orichal-auth') : null;

export function signIn({ user, accessToken }) {
  setAccessToken(accessToken);
  session.set({ status: 'user', user });
  socket.connect(accessToken);
}

export function signOut({ broadcast = true } = {}) {
  setAccessToken(null);
  session.set({ status: 'guest', user: null });
  socket.connect(null);
  if (broadcast) channel?.postMessage('logout');
}

export function setUser(user) {
  session.set({ user });
}

export const currentUser = () => session.get().user;
export const isAdmin = () => session.get().user?.role === 'admin';

channel?.addEventListener('message', (e) => {
  if (e.data === 'logout' && session.get().status === 'user') signOut({ broadcast: false });
});
