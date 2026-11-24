// In front of the private route groups (/users, /orders, /trades, /wallet,
// /kyc, /notifications, /admin): 401 without a signed-in user. The client then
// refreshes its access token once and tries again.

import { unauthenticated } from '../lib/errors.js';

export function requireAuth(req, res, next) {
  next(req.user ? undefined : unauthenticated());
}
