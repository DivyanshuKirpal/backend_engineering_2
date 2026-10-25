// Sessions for the mock sign-in. A real refresh token lives in an httpOnly
// cookie the page can't read; here localStorage key `orichal.rt` stands in for
// that cookie and only this mock server reads it. Access tokens live in memory,
// as in section 4, and a page load gets a fresh one through /auth/refresh.

import { db, newId, persist } from './db.js';
import { unauthenticated, forbidden } from './errors.js';

const COOKIE_KEY = 'orichal.rt';
const tokens = new Map(); // access token -> session id
const tickets = new Map(); // 2FA login ticket -> { userId, attemptsLeft, expiresAt }
export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;

export function readCookie() {
  try {
    return JSON.parse(localStorage.getItem(COOKIE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeCookie(value) {
  try {
    if (value) localStorage.setItem(COOKIE_KEY, JSON.stringify(value));
    else localStorage.removeItem(COOKIE_KEY);
  } catch {
    // ignore: the session then lasts until the page closes
  }
}

export function clearCookie() {
  writeCookie(null);
  tokens.clear();
}

export function issueToken(sessionId) {
  const token = `mock.${newId()}.${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  tokens.set(token, sessionId);
  return token;
}

/** The session and user behind an `Authorization: Bearer` header. */
export function fromHeader(headers) {
  const token = /^Bearer (.+)$/.exec(headers?.authorization ?? '')?.[1];
  const sessionId = token && tokens.get(token);
  const session = sessionId && db().sessions.find((s) => s.id === sessionId && !s.revokedAt);
  const user = session && db().users.find((u) => u.id === session.userId);
  return user ? { user, session } : null;
}

export function requireUser(ctx) {
  if (!ctx.user) throw unauthenticated();
  return ctx.user;
}

export function requireAdmin(ctx) {
  const user = requireUser(ctx);
  if (user.role !== 'admin') throw forbidden('Admins only.');
  return user;
}

/** "Chrome 130 on macOS" from a browser's user agent. */
export function deviceName(ua = navigator.userAgent) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
  const match = /Edg\/(\d+)/.exec(ua) ? ['Edge', /Edg\/(\d+)/.exec(ua)[1]]
    : /Firefox\/(\d+)/.exec(ua) ? ['Firefox', /Firefox\/(\d+)/.exec(ua)[1]]
      : /Chrome\/(\d+)/.exec(ua) ? ['Chrome', /Chrome\/(\d+)/.exec(ua)[1]]
        : /Version\/(\d+).*Safari/.exec(ua) ? ['Safari', null] : ['A browser', null];
  const [browser, version] = match;
  return { device: `${browser}${version && os !== 'iPhone' ? ` ${version}` : ''} on ${os}`, family: `${browser} on ${os}` };
}

const DEMO_IP = '203.0.113.24';

export function audit(actor, action, { targetType = 'user', targetId = actor?.id ?? null, metadata = {}, device, ip = DEMO_IP } = {}) {
  db().audit.push({
    id: newId(),
    actor: actor ? { id: actor.id, email: actor.email, role: actor.role } : null,
    action, targetType, targetId, metadata,
    ip, device: device ?? deviceName().family,
    createdAt: new Date().toISOString(),
  });
  persist();
}

/**
 * Signs a user in on this browser. A returning user gets their first session
 * back (this browser is the same device); a new one gets a session named after
 * the browser. Sets the stand-in cookie and returns an access token.
 */
export function startSession(user) {
  const now = new Date().toISOString();
  const own = db().sessions.filter((s) => s.userId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let session = own[0];
  if (session) {
    session.revokedAt = null;
    session.lastUsedAt = now;
  } else {
    session = { id: newId(), device: deviceName().device, ip: DEMO_IP, lastUsedAt: now, createdAt: now, userId: user.id };
    db().sessions.push(session);
  }
  user.lastLoginAt = now;
  user.failedLoginCount = 0;
  delete db().lockouts[user.email];
  audit(user, 'auth.login', { device: session.device.replace(/ \d+ on /, ' on '), ip: session.ip });
  writeCookie({ sessionId: session.id });
  persist();
  return { session, accessToken: issueToken(session.id) };
}

export function refresh() {
  const cookie = readCookie();
  const session = cookie && db().sessions.find((s) => s.id === cookie.sessionId && !s.revokedAt);
  const user = session && db().users.find((u) => u.id === session.userId);
  if (!user) {
    writeCookie(null);
    throw unauthenticated('Your session has ended. Log in again.');
  }
  session.lastUsedAt = new Date().toISOString();
  persist();
  return { user, session, accessToken: issueToken(session.id) };
}

export function endSession() {
  const cookie = readCookie();
  const session = cookie && db().sessions.find((s) => s.id === cookie.sessionId);
  if (session) session.revokedAt = new Date().toISOString();
  clearCookie();
  persist();
}

export function currentSessionId() {
  return readCookie()?.sessionId ?? null;
}

// ---------------------------------------------------------------- 2FA tickets
export function newTicket(userId) {
  const ticket = newId();
  tickets.set(ticket, { userId, attemptsLeft: 5, expiresAt: Date.now() + 5 * 60 * 1000 });
  return ticket;
}

export function ticket(id) {
  const t = tickets.get(id);
  if (!t || t.expiresAt < Date.now()) {
    tickets.delete(id);
    return null;
  }
  return t;
}

export const dropTicket = (id) => tickets.delete(id);
