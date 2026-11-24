// What registering, logging in and the 2FA step may send, and what a new
// password must be.

import { z } from 'zod';
import { MIN_LENGTH, strength } from '../../../../client/src/models/domain/password.rules.js';
import { rule } from '../../lib/validation.js';
import { tooLong } from '../../model/services/auth.service.js';
import { code, displayName, email, secret, text } from './rules.js';

/** The client's own password rules, checked again here, plus bcrypt's 72 bytes. */
export const newPassword = secret('Choose a password.')
  .refine((value) => value.length >= MIN_LENGTH && strength(value).score >= 2, rule('weak', 'Choose a stronger password.'))
  .refine((value) => !tooLong(value), rule('long', 'Choose a shorter password, at most 72 characters.'));

export const register = z.object({ email, displayName, password: newPassword });

// The email's format isn't checked here: one that isn't an email belongs to no account anyway
export const login = z.object({
  email: text('Enter your email.', { max: 254 }).toLowerCase(),
  password: secret('Enter your password.'),
});

export const loginTwoFactor = z.object({
  loginTicket: text('Start again from your password.'),
  code: code('Enter the six digits.'),
});
