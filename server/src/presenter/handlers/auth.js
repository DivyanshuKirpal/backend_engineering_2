// Auth routes (section 4, auth.routes.js). They check the input and answer;
// model/services/auth.service.js does the sign-in against MongoDB, and
// model/exchange/session.js keeps the session and its rt cookie.

import { strength, MIN_LENGTH } from '../../../../client/src/models/domain/password.rules.js';
import { env } from '../../config/env.js';
import { ApiError, badRequest, unauthenticated } from '../../lib/errors.js';
import { lower, requireFields } from '../../lib/util.js';
import { notify } from '../../model/exchange/engine.js';
import * as session from '../../model/exchange/session.js';
import { grouped } from '../../model/exchange/text.js';
import * as wallet from '../../model/exchange/wallet.js';
import * as authService from '../../model/services/auth.service.js';
import { db, persist } from '../../model/store.js';
import { userDto } from '../mappers.js';

const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Refuses a new password that is weak, or longer than bcrypt reads. `field` names it in the details. */
export function checkNewPassword(password, field) {
  if (password.length < MIN_LENGTH || strength(password).score < 2) throw badRequest('Choose a stronger password.', { [field]: 'weak' });
  if (authService.tooLong(password)) throw badRequest('Choose a shorter password, at most 72 characters.', { [field]: 'long' });
}

/** The answer to a finished sign-in: a session of its own, the rt cookie and an access token. */
async function signedIn(ctx, user) {
  const { accessToken } = await session.startSession(ctx, user);
  return { user: userDto(user), accessToken };
}

export default [
  ['POST', '/auth/register', async (ctx) => {
    requireFields(ctx.body, ['email', 'password', 'displayName']);
    const email = lower(ctx.body.email);
    const displayName = String(ctx.body.displayName).trim();
    const password = String(ctx.body.password);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Enter a valid email address.', { email: 'format' });
    if (displayName.length < 2 || displayName.length > 40) throw badRequest('Display names are 2 to 40 characters.', { displayName: 'length' });
    checkNewPassword(password, 'password');

    const user = await authService.register({ email, password, displayName });
    for (const a of db().assets) db().addresses.push({ userId: user.id, asset: a.code, address: `sim-${a.code.toLowerCase()}-${randomHex()}` });
    const credit = env.DEMO_CREDIT_USDT;
    wallet.credit(user.id, 'USDT', credit, 'demo_credit', { refType: 'system', note: 'Sign-up credit', time: user.createdAt });
    session.audit(ctx, user, 'user.registered');
    const data = await signedIn(ctx, user);
    notify(user.id, 'deposit', 'Welcome to Orichal', `Your ${grouped(credit)} demo USDT is in your wallet.`, '/wallet');
    return { status: 201, data };
  }],

  ['POST', '/auth/login', async (ctx) => {
    requireFields(ctx.body, ['email', 'password']);
    const user = await authService.checkPassword(ctx, lower(ctx.body.email), String(ctx.body.password));
    if (user.twoFactorEnabled) return { data: { requires2fa: true, loginTicket: session.newTicket(user.id) } };
    return { data: await signedIn(ctx, user) };
  }],

  ['POST', '/auth/login/2fa', async (ctx) => {
    requireFields(ctx.body, ['loginTicket', 'code']);
    const ticket = session.ticket(ctx.body.loginTicket);
    if (!ticket || ticket.attemptsLeft <= 0) throw unauthenticated('That sign-in has expired. Start again.');
    const user = db().users.find((u) => u.id === ticket.userId);
    // Counted before the code is compared, so codes sent at the same moment can't share one try
    ticket.attemptsLeft -= 1;
    if (!(await authService.codeMatches(user.id, ctx.body.code))) {
      session.audit(ctx, user, 'auth.2fa_failed');
      if (ticket.attemptsLeft <= 0) {
        session.dropTicket(ctx.body.loginTicket);
        throw unauthenticated('Too many wrong codes. Start again from your password.');
      }
      throw new ApiError(400, 'INVALID_2FA_CODE', 'That code didn\'t work.', { attemptsLeft: ticket.attemptsLeft });
    }
    // A ticket signs in once
    if (!session.dropTicket(ctx.body.loginTicket)) throw unauthenticated('That sign-in has expired. Start again.');
    return { data: await signedIn(ctx, user) };
  }],

  ['POST', '/auth/refresh', (ctx) => {
    const { accessToken } = session.refresh(ctx);
    return { data: { accessToken } };
  }],

  ['POST', '/auth/logout', (ctx) => {
    session.endSession(ctx);
    return { status: 204, data: null };
  }],

  ['POST', '/auth/verify-email/resend', (ctx) => {
    const user = session.requireUser(ctx);
    if (user.emailVerified) return { data: { sent: false } };
    // Stands in for the user clicking the emailed link a moment later.
    setTimeout(() => {
      user.emailVerified = true;
      session.audit(ctx, user, 'user.email_verified');
      persist();
      notify(user.id, 'security', 'Email confirmed', `${user.email} is confirmed.`, '/account/profile');
    }, 3500);
    return { data: { sent: true } };
  }],
];
