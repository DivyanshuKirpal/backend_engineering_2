// What the profile, the password and the two-factor forms may send, and the
// account's own lists.

import { z } from 'zod';
import { rule } from '../../lib/validation.js';
import { newPassword } from './auth.validator.js';
import { code, displayName, limit, offset, oneOf, secret } from './rules.js';

export const profile = z.object({
  displayName: displayName.nullish(),
  preferences: z.object({
    theme: oneOf(['light', 'dark'], 'Unknown theme.').nullish(),
    hideSmallBalances: z.boolean(rule('type', 'hideSmallBalances is true or false.')).nullish(),
  }, rule('type', 'Preferences are an object.')).nullish(),
});

export const password = z.object({ currentPassword: secret('Enter your current password.'), newPassword });

export const enableTwoFactor = z.object({ code: code('Enter the six digits.') });

export const disableTwoFactor = z.object({
  code: code('Enter the six digits.'),
  password: secret('Enter your password.').optional(), // an account made with Google has none
});

export const activity = z.object({ cursor: offset, limit });

export const notifications = z.object({
  unread: oneOf(['true', 'false'], 'unread is true or false.').optional(),
  cursor: offset,
  limit,
});
