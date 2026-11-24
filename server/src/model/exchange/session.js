// Sessions: who is signed in, and on which device. One document per login in
// MongoDB, one per device, and two JWTs that name it (token.service.js):
//
//   - the refresh token is in the `rt` cookie. It is httpOnly (the page's
//     JavaScript can't read it), SameSite=Strict, sent only to /api/v1/auth, and
//     Secure in production. Every use rotates it.
//   - the access token is in the page's memory and comes back as
//     `Authorization: Bearer`. A signature proves it, so the server keeps no
//     list of them; it is refused once its session has ended.
//
// Sessions are read and written in MongoDB directly, then remembered in the
// store's working set, where every request looks them up. Every function that
// needs the request takes its context, `ctx`, from the adapter
// (view/routes/index.js): ctx.cookies, ctx.userAgent and ctx.ip.

import { env } from '../../config/env.js';
import { forbidden, unauthenticated } from '../../lib/errors.js';
import { durationMs } from '../../lib/util.js';
import { toRecord } from '../documents.js';
import { Session } from '../schemas/Session.js';
import * as tokens from '../services/token.service.js';
import { db, newId, persist, remember } from '../store.js';
import { publish } from './bus.js';

const COOKIE = 'rt';
const tickets = new Map(); // 2FA login ticket -> { userId, attemptsLeft, expiresAt }

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.NODE_ENV === 'production',
  path: '/api/v1/auth',
});

/** Signed in: not ended, and used within its lifetime (MongoDB deletes it some time after that). */
export const isLive = (session) => !session.revokedAt && Date.parse(session.expiresAt) > Date.now();

const findLive = (sid) => db().sessions.find((s) => s.id === sid && isLive(s)) ?? null;

/** A session document as the working set's record. Answers can arrive out of order, so one that has ended stays ended. */
function taken(doc) {
  const record = toRecord('sessions', doc);
  const mine = db().sessions.find((s) => s.id === record.id);
  return remember('sessions', mine?.revokedAt ? { ...record, revokedAt: mine.revokedAt } : record);
}

/** The session and user behind an access token, or null. `claims` is the token's payload. */
export function fromToken(token) {
  const claims = tokens.readAccess(token);
  const session = claims && findLive(claims.sid);
  if (!session || session.userId !== claims.sub) return null;
  const user = db().users.find((u) => u.id === claims.sub);
  return user ? { user, session, claims } : null;
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

/** Sends the rt cookie: the session's current refresh token, for one refresh lifetime from now. */
function sendCookie(ctx, session) {
  ctx.cookies.set(COOKIE, tokens.signRefresh(session), { ...cookieOptions(), maxAge: durationMs(env.REFRESH_TOKEN_TTL) });
}

/** Ends sessions: their access and refresh tokens stop working at once, and their sockets leave the user's room. */
async function end(sessions) {
  if (!sessions.length) return;
  const revokedAt = new Date().toISOString();
  await Session.updateMany({ _id: { $in: sessions.map((s) => s.id) } }, { $set: { revokedAt } });
  for (const session of sessions) {
    remember('sessions', { ...session, revokedAt });
    publish(`session:${session.id}`, 'session.ended', {});
  }
}

export const revoke = (session) => end([session]);

/** Ends every live session of a user but one; returns how many that was. */
export async function revokeOthers(userId, keepId) {
  const others = db().sessions.filter((s) => s.userId === userId && s.id !== keepId && isLive(s));
  await end(others);
  return others.length;
}

/** The live session this browser's rt cookie names, whatever the token's version. */
function fromCookie(ctx) {
  const claims = tokens.readRefresh(ctx.cookies.get(COOKIE));
  return claims && findLive(claims.sid);
}

/**
 * Signs a user in: a session of its own for every login, one per device, named
 * from the User-Agent header, with the request's IP. A browser holds one rt
 * cookie, so a session it already had ends here rather than staying signed in
 * with nobody holding its cookie. Sets the cookie and returns an access token.
 */
export async function startSession(ctx, user) {
  const earlier = fromCookie(ctx);
  if (earlier) await revoke(earlier);
  const session = taken(await Session.create({
    userId: user.id, device: deviceName(ctx.userAgent).device, userAgent: ctx.userAgent, ip: ctx.ip, expiresAt: tokens.sessionExpiry(),
  }));
  user.lastLoginAt = session.createdAt;
  audit(ctx, user, 'auth.login');
  sendCookie(ctx, session);
  return { session, accessToken: tokens.signAccess(user, session) };
}

/** POST /auth/refresh: a new access token and the next refresh token, for the rt cookie's. */
export async function refresh(ctx) {
  const claims = tokens.readRefresh(ctx.cookies.get(COOKIE));
  const { session: doc, reused } = claims ? await tokens.rotate(claims) : {};
  const session = doc && taken(doc);
  const user = session && isLive(session) && db().users.find((u) => u.id === session.userId);
  if (user) {
    sendCookie(ctx, session);
    return { user, session, accessToken: tokens.signAccess(user, session) };
  }
  if (reused) {
    // An old refresh token: somebody kept a copy. Nobody can tell whose this one is, so the session ends for both.
    const ended = taken(reused);
    await revoke(ended);
    audit(ctx, db().users.find((u) => u.id === ended.userId), 'auth.refresh_reused', { metadata: { device: ended.device } });
  }
  ctx.cookies.clear(COOKIE, cookieOptions());
  throw unauthenticated('Your session has ended. Log in again.');
}

/** POST /auth/logout: ends the cookie's session; works without an access token. */
export async function endSession(ctx) {
  const session = fromCookie(ctx);
  if (session) await revoke(session);
  ctx.cookies.clear(COOKIE, cookieOptions());
}

/** For a demo reset: the 2FA tickets go. (The sessions are in MongoDB, which the reset empties, so their tokens name nothing.) */
export function forgetTickets() {
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
