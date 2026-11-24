// Account routes (section 4, user.routes.js).

import { db, persist } from '../../model/store.js';
import { ApiError, badRequest, conflict, notFound } from '../../lib/errors.js';
import { sessionDto, userDto } from '../mappers.js';
import * as session from '../../model/exchange/session.js';
import { notify } from '../../model/exchange/engine.js';
import * as authService from '../../model/services/auth.service.js';
import { cursorPage, newestFirst } from '../../lib/util.js';
import { checkNewPassword } from './auth.js';

const DEMO_SECRET = 'JBSWY3DPEHPK3PXP';
const SECURITY_ACTIONS = new Set([
  'auth.login', 'auth.login_failed', 'auth.2fa_failed', 'user.registered', 'user.2fa_enabled', 'user.2fa_disabled',
  'user.password_changed', 'user.email_verified', 'user.sessions_revoked', 'user.session_revoked',
]);

const wrongCode = () => new ApiError(400, 'INVALID_2FA_CODE', 'That code didn\'t work.', { attemptsLeft: null });

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

  ['PATCH', '/users/me/password', async (ctx) => {
    const user = session.requireUser(ctx);
    const current = String(ctx.body?.currentPassword ?? '');
    const next = String(ctx.body?.newPassword ?? '');
    if (!(await authService.passwordMatches(user.id, current))) throw badRequest('Your current password isn\'t right.', { currentPassword: 'wrong' });
    checkNewPassword(next, 'newPassword');
    if (next === current) throw badRequest('Choose a password you haven\'t used here.', { newPassword: 'same' });
    await authService.setPassword(user.id, next);
    const revoked = session.revokeOthers(user.id, ctx.session.id);
    session.audit(ctx, user, 'user.password_changed', { metadata: { otherSessionsSignedOut: revoked } });
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

  ['POST', '/users/me/2fa/enable', async (ctx) => {
    const user = session.requireUser(ctx);
    if (String(ctx.body?.code ?? '') !== authService.DEMO_CODE) throw wrongCode();
    await authService.setTwoFactor(user.id, true);
    session.audit(ctx, user, 'user.2fa_enabled');
    notify(user.id, 'security', 'Two-factor turned on', 'Logging in and withdrawing now ask for a code from your authenticator app.', '/account/security');
    persist();
    return { data: { twoFactorEnabled: true } };
  }],

  ['POST', '/users/me/2fa/disable', async (ctx) => {
    const user = session.requireUser(ctx);
    if (!(await authService.codeMatches(user.id, ctx.body?.code))) throw wrongCode();
    if (user.hasPassword && !(await authService.passwordMatches(user.id, ctx.body?.password))) {
      throw badRequest('Your password isn\'t right.', { password: 'wrong' });
    }
    await authService.setTwoFactor(user.id, false);
    session.audit(ctx, user, 'user.2fa_disabled');
    notify(user.id, 'security', 'Two-factor turned off', 'Logging in now needs only your password.', '/account/security');
    persist();
    return { data: { twoFactorEnabled: false } };
  }],

  ['GET', '/users/me/sessions', (ctx) => {
    const user = session.requireUser(ctx);
    const list = db().sessions.filter((s) => s.userId === user.id && session.isLive(s)).sort(newestFirst('lastUsedAt'));
    return { data: { sessions: list.map((s) => sessionDto(s, ctx.session.id)) } };
  }],

  ['DELETE', '/users/me/sessions/:id', (ctx) => {
    const user = session.requireUser(ctx);
    const s = db().sessions.find((x) => x.id === ctx.params.id && x.userId === user.id && session.isLive(x));
    if (!s) throw notFound('That device isn\'t signed in.');
    if (s.id === ctx.session.id) throw conflict('Use Log out to end this device\'s session.');
    session.revoke(s);
    session.audit(ctx, user, 'user.session_revoked', { metadata: { device: s.device } });
    return { status: 204, data: null };
  }],

  ['DELETE', '/users/me/sessions', (ctx) => {
    const user = session.requireUser(ctx);
    const revoked = session.revokeOthers(user.id, ctx.session.id);
    session.audit(ctx, user, 'user.sessions_revoked', { metadata: { revoked } });
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
    return { data: { watchlist: [...user.watchlist] } };
  }],

  ['PUT', '/users/me/watchlist/:symbol', (ctx) => {
    const user = session.requireUser(ctx);
    if (!db().markets.some((m) => m.symbol === ctx.params.symbol && m.status !== 'delisted')) throw notFound('That market doesn\'t exist.');
    if (!user.watchlist.includes(ctx.params.symbol)) {
      if (user.watchlist.length >= 50) throw conflict('Your watchlist is full.');
      user.watchlist.push(ctx.params.symbol);
    }
    persist();
    return { data: { watchlist: [...user.watchlist] } };
  }],

  ['DELETE', '/users/me/watchlist/:symbol', (ctx) => {
    const user = session.requireUser(ctx);
    user.watchlist = user.watchlist.filter((s) => s !== ctx.params.symbol);
    persist();
    return { data: { watchlist: [...user.watchlist] } };
  }],
];
