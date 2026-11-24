// Runs on every API request and only finds out who is asking: a valid access
// token in `Authorization: Bearer` sets req.user and req.session. It refuses
// nobody. On a public route (markets, assets) a missing or expired token just
// means a guest; requireAuth.js guards the rest.

import { fromToken } from '../model/exchange/session.js';

export function authenticate(req, res, next) {
  const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
  const who = fromToken(token);
  req.user = who?.user ?? null;
  req.session = who?.session ?? null;
  // A private answer, or one that carries tokens, must not be kept by any cache
  if (who || req.path.startsWith('/auth/')) res.set('Cache-Control', 'no-store');
  next();
}
