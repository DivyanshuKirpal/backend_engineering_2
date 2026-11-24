// What deposits, withdrawals and the wallet's lists may send. The asset's own
// rules (decimals, limits, the address format, the balance) stay in the handler.

import { z } from 'zod';
import { rule } from '../../lib/validation.js';
import { amount, limit, offset, oneOf, text } from './rules.js';

const asset = text('Choose an asset.', { max: 10 }).toUpperCase();

export const deposit = z.object({ asset, amount: amount('amount') });

export const withdrawal = z.object({
  asset,
  amount: amount('amount'),
  address: text('Enter the address.', { max: 120 }),
  code: z.coerce.string().trim().max(20, rule('format', 'Enter the six digits.')).nullish(), // only with two-factor on
});

const TYPES = rule('format', 'Entry types, separated by commas.');

export const ledger = z.object({
  asset: text('One asset, such as USDT.', { max: 10 }).optional(),
  type: z.string(TYPES).max(300, { error: TYPES, abort: true }).regex(/^[a-z_]+(,[a-z_]+)*$/, TYPES).optional(),
  cursor: offset,
  limit,
});

export const transactions = z.object({
  type: oneOf(['deposit', 'withdrawal'], 'Type is deposit or withdrawal.').optional(),
  status: oneOf(['pending', 'completed', 'rejected', 'cancelled'], 'Unknown status.').optional(),
  cursor: offset,
  limit,
});
