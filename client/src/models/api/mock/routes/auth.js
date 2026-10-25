// Auth routes (section 4, auth.routes.js) for the mock sign-in. Accounts and
// passwords come from demo-accounts.json and registrations made in the demo;
// nothing here is real authentication.

import { strength, MIN_LENGTH } from '../../../domain/password.rules.js';
import { db, newId, persist } from '../db.js';
import { MockError, badRequest, conflict, unauthenticated } from '../errors.js';
import { userDto } from '../mappers.js';
import * as session from '../session.js';
import * as wallet from '../wallet.js';
import { notify } from '../engine.js';
import { lower, requireFields } from '../util.js';

function failedLogin(email, user) {
  const record = db().lockouts[email] ?? { count: 0, lockUntil: null };
  record.count += 1;
  if (record.count >= session.LOCK_AFTER) {
    record.lockUntil = new Date(Date.now() + session.LOCK_MINUTES * 60000).toISOString();
    record.count = 0;
  }
  db().lockouts[email] = record;
  if (user) {
    user.failedLoginCount = (user.failedLoginCount ?? 0) + 1;
    session.audit(user, 'auth.login_failed');
  }
  persist();
  if (record.lockUntil) throw new MockError(423, 'ACCOUNT_LOCKED', 'Too many wrong passwords. Sign-in is paused for 15 minutes.', { lockUntil: record.lockUntil });
  throw unauthenticated('That email and password don\'t match an account.');
}

const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

export default [
  ['POST', '/auth/register', (ctx) => {
    requireFields(ctx.body, ['email', 'password', 'displayName']);
    const email = lower(ctx.body.email);
    const displayName = String(ctx.body.displayName).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Enter a valid email address.', { email: 'format' });
    if (displayName.length < 2 || displayName.length > 40) throw badRequest('Display names are 2 to 40 characters.', { displayName: 'length' });
    if (String(ctx.body.password).length < MIN_LENGTH || strength(ctx.body.password).score < 2) {
      throw badRequest('Choose a stronger password.', { password: 'weak' });
    }
    if (db().users.some((u) => u.email === email)) throw conflict('An account with this email already exists.', { email: 'taken' });

    const now = new Date().toISOString();
    const user = {
      id: newId(), email, displayName, role: 'user', status: 'active',
      emailVerified: false, kycStatus: 'none', twoFactorEnabled: false, twoFactorEnabledAt: null,
      hasPassword: true, googleLinked: false, avatarUrl: null,
      preferences: { theme: 'light', hideSmallBalances: false },
      createdAt: now, isBot: false, failedLoginCount: 0, lastLoginAt: null,
    };
    db().users.unshift(user);
    db().credentials[email] = { password: String(ctx.body.password), twoFactorCode: null };
    db().watchlists[user.id] = [];
    for (const a of db().assets) db().addresses.push({ userId: user.id, asset: a.code, address: `sim-${a.code.toLowerCase()}-${randomHex()}` });
    wallet.credit(user.id, 'USDT', '10000', 'demo_credit', { refType: 'system', note: 'Sign-up credit', time: now });
    session.audit(user, 'user.registered');
    const { accessToken } = session.startSession(user);
    notify(user.id, 'deposit', 'Welcome to Orichal', 'Your 10,000 demo USDT is in your wallet.', '/wallet');
    persist();
    return { status: 201, data: { user: userDto(user), accessToken } };
  }],

  ['POST', '/auth/login', (ctx) => {
    requireFields(ctx.body, ['email', 'password']);
    const email = lower(ctx.body.email);
    const lock = db().lockouts[email];
    if (lock?.lockUntil && Date.parse(lock.lockUntil) > Date.now()) {
      throw new MockError(423, 'ACCOUNT_LOCKED', 'Too many wrong passwords. Sign-in is paused for 15 minutes.', { lockUntil: lock.lockUntil });
    }
    const user = db().users.find((u) => u.email === email && !u.isBot);
    const cred = db().credentials[email];
    if (!user || !cred || cred.password !== String(ctx.body.password)) return failedLogin(email, user);
    delete db().lockouts[email];
    if (user.twoFactorEnabled) {
      return { data: { requires2fa: true, loginTicket: session.newTicket(user.id) } };
    }
    const { accessToken } = session.startSession(user);
    return { data: { user: userDto(user), accessToken } };
  }],

  ['POST', '/auth/login/2fa', (ctx) => {
    requireFields(ctx.body, ['loginTicket', 'code']);
    const t = session.ticket(ctx.body.loginTicket);
    if (!t) throw unauthenticated('That sign-in has expired. Start again.');
    const user = db().users.find((u) => u.id === t.userId);
    const expected = db().credentials[user.email]?.twoFactorCode;
    if (String(ctx.body.code) !== expected) {
      t.attemptsLeft -= 1;
      session.audit(user, 'auth.2fa_failed');
      if (t.attemptsLeft <= 0) {
        session.dropTicket(ctx.body.loginTicket);
        throw unauthenticated('Too many wrong codes. Start again from your password.');
      }
      throw new MockError(400, 'INVALID_2FA_CODE', 'That code didn\'t work.', { attemptsLeft: t.attemptsLeft });
    }
    session.dropTicket(ctx.body.loginTicket);
    const { accessToken } = session.startSession(user);
    return { data: { user: userDto(user), accessToken } };
  }],

  ['POST', '/auth/refresh', () => {
    const { accessToken } = session.refresh();
    return { data: { accessToken } };
  }],

  ['POST', '/auth/logout', () => {
    session.endSession();
    return { status: 204, data: null };
  }],

  ['POST', '/auth/verify-email/resend', (ctx) => {
    const user = session.requireUser(ctx);
    if (user.emailVerified) return { data: { sent: false } };
    // Stands in for the user clicking the emailed link a moment later.
    setTimeout(() => {
      user.emailVerified = true;
      session.audit(user, 'user.email_verified');
      persist();
      notify(user.id, 'security', 'Email confirmed', `${user.email} is confirmed.`, '/account/profile');
    }, 3500);
    return { data: { sent: true } };
  }],
];
