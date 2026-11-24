// What the admin's decisions and lists may send. A market's settings are checked
// in the handler, by the rules it shares with the client (market.rules.js).

import { z } from 'zod';
import { rule } from '../../lib/validation.js';
import { count, limit, offset, oneOf, text } from './rules.js';

const reason = z.string(rule('type', 'The reason is a text.')).trim().max(500, rule('length', 'At most 500 characters.')).nullish();
const page = count(100000, 'Pages start at 1.');

export const userStatus = z.object({ status: oneOf(['active', 'frozen'], 'Status is active or frozen.'), reason })
  .refine((body) => body.status !== 'frozen' || body.reason, { path: ['reason'], message: rule('required', 'Give a reason for freezing.') });

export const userRole = z.object({ role: oneOf(['user', 'admin'], 'Role is user or admin.') });

/** For an identity check or a withdrawal. */
export const decision = z.object({ decision: oneOf(['approve', 'reject'], 'Decide approve or reject.'), reason })
  .refine((body) => body.decision !== 'reject' || body.reason, { path: ['reason'], message: rule('required', 'Give the reason the user will see.') });

export const users = z.object({
  search: z.string(rule('type', 'Search for a text.')).trim().max(100, rule('length', 'At most 100 characters.')).optional(),
  role: oneOf(['user', 'admin'], 'Role is user or admin.').optional(),
  status: oneOf(['active', 'frozen'], 'Status is active or frozen.').optional(),
  page,
  limit,
});

export const kyc = z.object({ status: oneOf(['pending', 'approved', 'rejected'], 'Unknown status.').optional(), page, limit });

export const kycDocument = z.object({ image: oneOf(['document', 'selfie'], 'The image is document or selfie.').optional() });

export const withdrawals = z.object({
  status: oneOf(['pending', 'completed', 'rejected', 'cancelled'], 'Unknown status.').optional(),
  page,
  limit,
});

export const auditLogs = z.object({
  action: text('Unknown action.').optional(),
  actorId: text('Unknown actor.').optional(),
  cursor: offset,
  limit,
});
