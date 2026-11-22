// With DEMO_CONTROLS on, in front of the API routes. After POST
// /demo/fail-next, the same browser's next API request answers 503, so the
// Simulator menu can show a page's error state; the cookie goes with it. The
// demo routes themselves are never failed.

import { ApiError } from '../lib/errors.js';
import { FAIL_NEXT } from '../presenter/handlers/demo.js';

export function failNext(req, res, next) {
  if (!req.cookies?.[FAIL_NEXT.name] || req.path.startsWith('/demo/')) return next();
  res.clearCookie(FAIL_NEXT.name, FAIL_NEXT.options);
  next(new ApiError(503, 'INTERNAL', 'The demo failed this request on purpose. Try again.'));
}
