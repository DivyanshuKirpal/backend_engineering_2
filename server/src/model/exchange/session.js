// Sessions: who is signed in, and on which device. Moved from the mock, where a
// localStorage key stood in for the refresh cookie. On a server one stand-in
// shared by everyone would sign every visitor in as whoever logged in last, so
// the cookie is real now:
//
//   - `rt` holds a random token. It is httpOnly (the page's JavaScript can't
//     read it), SameSite=Strict, sent only to /api/v1/auth, and Secure in
//     production. The store keeps the token's SHA-256 hash, never the token,
//     mapped to the session, so a copy of the store file can't sign anyone in.
//   - Access tokens are random strings kept in memory, sent back as
//     `Authorization: Bearer`. A server restart forgets them; the client then
//     gets a new one from /auth/refresh with its cookie.
//
// M6 replaces both with JWTs, rotated as section 4 says. Every function that
// needs the request takes its context, `ctx`, from the adapter
// (view/routes/index.js): ctx.cookies, ctx.userAgent and ctx.ip.

import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { forbidden, unauthenticated } from '../../lib/errors.js';
import { durationMs } from '../../lib/util.js';
import { db, newId, persist } from '../store.js';

const COOKIE = 'rt';
const tokens = new Map(); // access token -> session id
const tickets = new Map(); // 2FA login ticket -> { userId, attemptsLeft, expiresAt }
export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.NODE_ENV === 'production',
  path: '/api/v1/auth',
});
const expiry = () => new Date(Date.now() + durationMs(env.REFRESH_TOKEN_TTL)).toISOString();
const hash = (token) => createHash('sha256').update(token).digest('hex');

export function issueToken(sessionId) {
  const token = randomBytes(24).toString('base64url');
  tokens.set(token, sessionId);
  return token;
}

/** The session and user behind an access token, or null. */
export function fromToken(token) {
  const sessionId = token && tokens.get(token);
  const session = sessionId && db().sessions.find((s) => s.id === sessionId && !s.revokedAt);
  const user = session && db().users.find((u) => u.id === session.userId);
  return user ? { user, session } : null;
}

/** The session and user behind an `Authorization: Bearer` header. */
export function fromHeader(headers) {
  return fromToken(/^Bearer (.+)$/.exec(headers?.authorization ?? '')?.[1]);
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

/** "Chrome 130 on macOS" from a browser's User-Agent header. */
export function deviceName(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
  const match = /Edg\/(\d+)/.exec(ua) ? ['Edge', /Edg\/(\d+)/.exec(ua)[1]]
    : /Firefox\/(\d+)/.exec(ua) ? ['Firefox', /Firefox\/(\d+)/.exec(ua)[1]]
      : /Chrome\/(\d+)/.exec(ua) ? ['Chrome', /Chrome\/(\d+)/.exec(ua)[1]]
        : /Version\/(\d+).*Safari/.exec(ua) ? ['Safari', null] : ['A browser', null];
  const [browser, version] = match;
  return { device: `${browser}${version && os !== 'iPhone' ? ` ${version}` : ''} on ${os}`, family: `${browser} on ${os}` };
}

/** Appends an audit log entry, with the device and IP of the request that caused it. */
export function audit(ctx, actor, action, { targetType = 'user', targetId = actor?.id ?? null, metadata = {}, device, ip } = {}) {
  db().audit.push({
    id: newId(),
    actor: actor ? { id: actor.id, email: actor.email, role: actor.role } : null,
    action, targetType, targetId, metadata,
    ip: ip ?? ctx.ip,
    device: device ?? deviceName(ctx.userAgent).family,
    createdAt: new Date().toISOString(),
  });
  persist();
}

/** Sends the rt cookie, for seven days from now (REFRESH_TOKEN_TTL). */
function sendCookie(ctx, token) {
  ctx.cookies.set(COOKIE, token, { ...cookieOptions(), maxAge: durationMs(env.REFRESH_TOKEN_TTL) });
}

/** Forgets every refresh and access token of a session. */
function forget(sessionId) {
  for (const [key, id] of Object.entries(db().refreshTokens)) if (id === sessionId) delete db().refreshTokens[key];
  for (const [token, id] of tokens) if (id === sessionId) tokens.delete(token);
}

/**
 * Signs a user in. A returning user gets their first session back: the demo
 * treats every browser as the device the seed data and the Security board
 * show. A user with no session yet gets one named after the browser in the
 * User-Agent header, with the request's IP. Sets the rt cookie and returns an
 * access token.
 */
export function startSession(ctx, user) {
  const now = new Date().toISOString();
  const own = db().sessions.filter((s) => s.userId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let session = own[0];
  if (session) {
    session.revokedAt = null;
    session.lastUsedAt = now;
    session.expiresAt = expiry();
  } else {
    session = {
      id: newId(), userId: user.id, device: deviceName(ctx.userAgent).device, userAgent: ctx.userAgent, ip: ctx.ip,
      tokenVersion: 0, rotatedAt: null, createdAt: now, lastUsedAt: now, expiresAt: expiry(), revokedAt: null,
    };
    db().sessions.push(session);
  }
  user.lastLoginAt = now;
  user.failedLoginCount = 0;
  delete db().lockouts[user.email];
  audit(ctx, user, 'auth.login', { device: session.device.replace(/ \d+ on /, ' on '), ip: session.ip });
  const token = randomBytes(32).toString('base64url');
  db().refreshTokens[hash(token)] = session.id;
  sendCookie(ctx, token);
  persist();
  return { session, accessToken: issueToken(session.id) };
}

/** POST /auth/refresh: the rt cookie's session gets a new access token. */
export function refresh(ctx) {
  const token = ctx.cookies.get(COOKIE);
  const key = token ? hash(token) : null;
  const sessionId = key && db().refreshTokens[key];
  const session = sessionId && db().sessions.find((s) => s.id === sessionId && !s.revokedAt);
  const user = session && db().users.find((u) => u.id === session.userId);
  if (!user) {
    if (key) delete db().refreshTokens[key];
    ctx.cookies.clear(COOKIE, cookieOptions());
    persist();
    throw unauthenticated('Your session has ended. Log in again.');
  }
  session.lastUsedAt = new Date().toISOString();
  session.expiresAt = expiry();
  // The same token again with a fresh expiry: seven days after the last use, as
  // section 3 has it. Rotating it on every refresh comes with M6.
  sendCookie(ctx, token);
  persist();
  return { user, session, accessToken: issueToken(session.id) };
}

/** POST /auth/logout: ends the cookie's session; works without an access token. */
export function endSession(ctx) {
  const token = ctx.cookies.get(COOKIE);
  const sessionId = token && db().refreshTokens[hash(token)];
  const session = sessionId && db().sessions.find((s) => s.id === sessionId);
  if (session) {
    session.revokedAt = new Date().toISOString();
    forget(session.id);
  }
  ctx.cookies.clear(COOKIE, cookieOptions());
  persist();
}

/** For a demo reset: every access token and 2FA ticket goes. (The refresh map is in the store, which the reset replaces.) */
export function forgetAll() {
  tokens.clear();
  tickets.clear();
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
