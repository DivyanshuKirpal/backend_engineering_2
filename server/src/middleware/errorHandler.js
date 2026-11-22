// The last middleware in app.js and the only place that writes an error
// response. When anything before it throws or calls next(err), Express skips
// the remaining ordinary middleware and calls this one. In Express 5 that
// includes a promise rejected in an async handler, so handlers need no
// try/catch. Express recognises an error handler by its four parameters, so
// `next` stays in the list even where it isn't used.

import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { fail } from '../view/http/respond.js';

export function errorHandler(err, req, res, next) {
  // The response has already started (a file stream broke halfway, say).
  // Only Express's default handler can end it, by closing the connection.
  if (res.headersSent) return next(err);

  // A handler refused the request on purpose: its own status and code.
  if (err instanceof ApiError) return fail(res, err.status, err);

  // express.json() couldn't parse the body, such as {bad
  if (err.type === 'entity.parse.failed') {
    return fail(res, 400, { code: 'VALIDATION_ERROR', message: 'The request body isn\'t valid JSON.' });
  }

  // express.json() stopped reading at its 100 kb limit
  if (err.type === 'entity.too.large') {
    return fail(res, 413, { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is over the 100 kb limit.' });
  }

  // Express's own libraries mark other mistakes in the request with a 4xx
  // `status`: a body in an unsupported charset, or a broken %-escape in the
  // URL (/trade/%E0%A4). The fault is the client's, so 400, not 500.
  if (err.status >= 400 && err.status < 500) {
    return fail(res, 400, { code: 'VALIDATION_ERROR', message: err.message });
  }

  // Anything else is a fault in the server. The stack goes to the server's
  // log with the request line; the response says only what kind of error it
  // was, plus the error's message outside production.
  console.error(`[error] ${req.method} ${req.originalUrl}\n`, err);
  return fail(res, 500, {
    code: 'INTERNAL',
    message: 'Something went wrong on the server. Try again.',
    details: env.NODE_ENV === 'production' ? undefined : { cause: err.message },
  });
}
