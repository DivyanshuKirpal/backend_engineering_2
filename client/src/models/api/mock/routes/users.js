// Account routes (section 4, user.routes.js).

import { strength, MIN_LENGTH } from '../../../domain/password.rules.js';
import { db, persist } from '../db.js';
import { MockError, badRequest, conflict, notFound } from '../errors.js';
import { sessionDto, userDto } from '../mappers.js';
import * as session from '../session.js';
import { notify } from '../engine.js';
import { cursorPage, newestFirst } from '../util.js';

const DEMO_SECRET = 'JBSWY3DPEHPK3PXP';
const DEMO_CODE = '123456';
const SECURITY_ACTIONS = new Set([
  'auth.login', 'auth.login_failed', 'auth.2fa_failed', 'user.registered', 'user.2fa_enabled', 'user.2fa_disabled',
  'user.password_changed', 'user.email_verified', 'user.sessions_revoked', 'user.session_revoked',
]);

function checkCode(code) {
  if (String(code ?? '') !== DEMO_CODE) throw new MockError(400, 'INVALID_2FA_CODE', 'That code didn\'t work.', { attemptsLeft: null });
}

export default [
  ['GET', '/users/me', (ctx) => ({ data: { user: userDto(session.requireUser(ctx)) } })],

  ['PATCH', '/users/me', (ctx) => {
    const user = session.requireUser(ctx);
    const { displayName, preferences } = ctx.body ?? {};
    if (displayName != null) {
      const name = String(displayName).trim();
      if (name.length < 2 || name.length > 40) throw badRequest('Display names are 2 to 40 characters.', { displayName: 'length' });
      user.displayName = name;
      for (const list of [db().kyc, db().transactions]) {
        for (const r of list) if (r.userId === user.id) r.userDisplayName = name;
      }
    }
    if (preferences) {
      if (preferences.theme != null && !['light', 'dark'].includes(preferences.theme)) throw badRequest('Unknown theme.', { theme: 'value' });
      user.preferences = {
        theme: preferences.theme ?? user.preferences.theme,
        hideSmallBalances: preferences.hideSmallBalances ?? user.preferences.hideSmallBalances,
      };
    }
    persist();
    return { data: { user: userDto(user) } };
  }],

  ['PATCH', '/users/me/password', (ctx) => {
    const user = session.requireUser(ctx);
    const cred = db().credentials[user.email];
    if (!cred || cred.password !== String(ctx.body?.currentPassword ?? '')) {
      throw badRequest('Your current password isn\'t right.', { currentPassword: 'wrong' });
    }
    const next = String(ctx.body?.newPassword ?? '');
    if (next.length < MIN_LENGTH || strength(next).score < 2) throw badRequest('Choose a stronger password.', { newPassword: 'weak' });
    if (next === cred.password) throw badRequest('Choose a password you haven\'t used here.', { newPassword: 'same' });
    cred.password = next;
    let revoked = 0;
    for (const s of db().sessions) {
      if (s.userId === user.id && !s.revokedAt && s.id !== ctx.session.id) {
        s.revokedAt = new Date().toISOString();
        revoked += 1;
      }
    }
    session.audit(user, 'user.password_changed', { metadata: { otherSessionsSignedOut: revoked } });
    notify(user.id, 'security', 'Password changed', 'Your other devices were signed out.', '/account/security');
    persist();
    return { data: { changed: true } };
  }],

  ['POST', '/users/me/2fa/setup', (ctx) => {
    const user = session.requireUser(ctx);
    if (user.twoFactorEnabled) throw conflict('Two-factor is already on.');
    const label = encodeURIComponent(`Orichal:${user.email}`);
    return { data: { otpauthUrl: `otpauth://totp/${label}?secret=${DEMO_SECRET}&issuer=Orichal`, manualKey: DEMO_SECRET.replace(/(.{4})/g, '$1 ').trim() } };
  }],

  ['POST', '/users/me/2fa/enable', (ctx) => {
    const user = session.requireUser(ctx);
    checkCode(ctx.body?.code);
    user.twoFactorEnabled = true;
    user.twoFactorEnabledAt = new Date().toISOString();
    db().credentials[user.email].twoFactorCode = DEMO_CODE;
    session.audit(user, 'user.2fa_enabled');
    notify(user.id, 'security', 'Two-factor turned on', 'Logging in and withdrawing now ask for a code from your authenticator app.', '/account/security');
    persist();
    return { data: { twoFactorEnabled: true } };
  }],

  ['POST', '/users/me/2fa/disable', (ctx) => {
    const user = session.requireUser(ctx);
    checkCode(ctx.body?.code);
    if (user.hasPassword && db().credentials[user.email]?.password !== String(ctx.body?.password ?? '')) {
      throw badRequest('Your password isn\'t right.', { password: 'wrong' });
    }
    user.twoFactorEnabled = false;
    user.twoFactorEnabledAt = null;
    db().credentials[user.email].twoFactorCode = null;
    session.audit(user, 'user.2fa_disabled');
    notify(user.id, 'security', 'Two-factor turned off', 'Logging in now needs only your password.', '/account/security');
    persist();
    return { data: { twoFactorEnabled: false } };
  }],

  ['GET', '/users/me/sessions', (ctx) => {
    const user = session.requireUser(ctx);
    const list = db().sessions.filter((s) => s.userId === user.id && !s.revokedAt).sort(newestFirst('lastUsedAt'));
    return { data: { sessions: list.map((s) => sessionDto(s, ctx.session.id)) } };
  }],

  ['DELETE', '/users/me/sessions/:id', (ctx) => {
    const user = session.requireUser(ctx);
    const s = db().sessions.find((x) => x.id === ctx.params.id && x.userId === user.id && !x.revokedAt);
    if (!s) throw notFound('That device isn\'t signed in.');
    if (s.id === ctx.session.id) throw conflict('Use Log out to end this device\'s session.');
    s.revokedAt = new Date().toISOString();
    session.audit(user, 'user.session_revoked', { metadata: { device: s.device } });
    persist();
    return { status: 204, data: null };
  }],

  ['DELETE', '/users/me/sessions', (ctx) => {
    const user = session.requireUser(ctx);
    let revoked = 0;
    for (const s of db().sessions) {
      if (s.userId === user.id && !s.revokedAt && s.id !== ctx.session.id) {
        s.revokedAt = new Date().toISOString();
        revoked += 1;
      }
    }
    session.audit(user, 'user.sessions_revoked', { metadata: { revoked } });
    persist();
    return { data: { revoked } };
  }],

  ['GET', '/users/me/activity', (ctx) => {
    const user = session.requireUser(ctx);
    const list = db().audit.filter((a) => a.actor?.id === user.id && SECURITY_ACTIONS.has(a.action)).sort(newestFirst());
    return { data: cursorPage(list, ctx.query, (a) => ({ action: a.action, ip: a.ip, device: a.device, createdAt: a.createdAt })) };
  }],

  ['GET', '/users/me/watchlist', (ctx) => {
    const user = session.requireUser(ctx);
    return { data: { watchlist: [...(db().watchlists[user.id] ?? [])] } };
  }],

  ['PUT', '/users/me/watchlist/:symbol', (ctx) => {
    const user = session.requireUser(ctx);
    if (!db().markets.some((m) => m.symbol === ctx.params.symbol && m.status !== 'delisted')) throw notFound('That market doesn\'t exist.');
    const list = db().watchlists[user.id] ?? (db().watchlists[user.id] = []);
    if (!list.includes(ctx.params.symbol)) {
      if (list.length >= 50) throw conflict('Your watchlist is full.');
      list.push(ctx.params.symbol);
    }
    persist();
    return { data: { watchlist: [...list] } };
  }],

  ['DELETE', '/users/me/watchlist/:symbol', (ctx) => {
    const user = session.requireUser(ctx);
    db().watchlists[user.id] = (db().watchlists[user.id] ?? []).filter((s) => s !== ctx.params.symbol);
    persist();
    return { data: { watchlist: [...db().watchlists[user.id]] } };
  }],
];
