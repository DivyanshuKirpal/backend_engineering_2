// Role-based access, after requireAuth. The role inside the access token is up
// to 15 minutes old, so it isn't trusted here: the user's role and status are
// read again from MongoDB, and a promotion, a demotion or a freeze applies at
// once, to tokens already handed out as well.

import { forbidden } from '../lib/errors.js';
import { reload } from '../model/services/auth.service.js';

export const authorize = (role) => async (req, res, next) => {
  const user = await reload(req.user.id);
  if (user?.role !== role || user.status !== 'active') throw forbidden('Admins only.');
  req.user = user;
  next();
};

export const requireAdmin = authorize('admin');
