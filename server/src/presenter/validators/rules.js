// The rules the validators share. A length check aborts the rules after it, so
// no regular expression ever runs over a text that is too long.

import { z } from 'zod';
import * as money from '../../../../client/src/models/domain/money.js';
import { rule } from '../../lib/validation.js';

/** The message for a value that isn't a string at all: missing, or of another type. */
const notText = (sentence) => ({ error: (issue) => rule(issue.input == null ? 'required' : 'type', sentence) });
const atLeastOne = (sentence) => ({ error: rule('required', sentence), abort: true });
const atMost = (sentence) => ({ error: rule('length', sentence), abort: true });

/** A required text, trimmed. */
export const text = (sentence, { max = 200 } = {}) => z.string(notText(sentence)).trim()
  .min(1, atLeastOne(sentence))
  .max(max, atMost(`At most ${max} characters.`));

/** Text that must stay exactly as typed, such as a password. */
export const secret = (sentence) => z.string(notText(sentence))
  .min(1, atLeastOne(sentence))
  .max(1000, atMost('That is too long.'));

/** A code of six digits. */
export const code = (sentence) => z.coerce.string().trim().refine((value) => /^\d{6}$/.test(value), rule('format', sentence));

/** One of a fixed list. */
export const oneOf = (values, sentence) => z.enum(values, rule('value', sentence));

export const email = text('Enter your email.', { max: 254 }).toLowerCase()
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, rule('format', 'Enter a valid email address.'));

export const displayName = z.string(notText('Enter a display name.')).trim()
  .refine((name) => name.length >= 2 && name.length <= 40, rule('length', 'Display names are 2 to 40 characters.'));

/**
 * An amount of money: a decimal string above zero, such as "0.00150000". Never a
 * JSON number, which has already been a float. Up to 15 digits before the point
 * and money.js's 18 after it, which Decimal128's 34 digits hold exactly.
 */
export const amount = (name) => z.string({
  error: (issue) => (issue.input == null ? rule('required', `Enter the ${name}.`) : rule('type', `Enter the ${name} as a string, such as "0.01".`)),
}).trim()
  .refine((value) => /^[+-]?(\d{1,15}(\.\d{0,18})?|\.\d{1,18})$/.test(value), { error: rule('decimal', `Enter the ${name} as a decimal number.`), abort: true })
  .refine((value) => money.isPositive(value), rule('positive', `The ${name} must be above zero.`));

/** A whole number in a query string, from 1 to `max`. */
export const count = (max, sentence) => z.coerce.number(rule('range', sentence))
  .int(rule('range', sentence))
  .min(1, rule('range', sentence))
  .max(max, rule('range', sentence))
  .optional();

/** ?limit= of a list. Each handler has its own default. */
export const limit = count(100, 'A page has 1 to 100 rows.');

const STALE = rule('format', 'That page isn\'t valid any more. Load the list again.');
/** ?cursor= of a keyset list: opaque text that lib/cursor.js reads. */
export const cursor = z.string(STALE).max(200, STALE).optional();
/** ?cursor= of a list that still counts rows in memory. */
export const offset = z.string(STALE).regex(/^\d{1,9}$/, STALE).optional();

const SYMBOL = rule('format', 'A market is written like BTC-USDT.');
export const marketSymbol = z.string(SYMBOL).regex(/^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}$/, SYMBOL);

export const side = oneOf(['buy', 'sell'], 'Side is buy or sell.');
