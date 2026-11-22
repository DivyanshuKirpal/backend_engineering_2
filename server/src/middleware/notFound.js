// Mounted on /api after the API router, so it sees only API requests that no
// route answered, such as GET /api/v1/nope. It doesn't write the 404 itself:
// it passes a NOT_FOUND ApiError to errorHandler.js, which writes every error
// response. Paths outside /api never reach it; they get the client's
// index.html and the client's router decides what to show.

import { notFound as notFoundError } from '../lib/errors.js';

export function notFound(req, res, next) {
  next(notFoundError(`No route for ${req.method} ${req.originalUrl.split('?')[0]}`));
}
