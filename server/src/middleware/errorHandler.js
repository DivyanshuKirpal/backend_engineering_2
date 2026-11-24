// The last middleware in app.js and the only place that writes an error
// response. When anything before it throws or calls next(err), Express skips
// the remaining ordinary middleware and calls this one. In Express 5 that
// includes a promise rejected in an async handler, so handlers need no
// try/catch. Express recognises an error handler by its four parameters, so
// `next` stays in the list even where it isn't used.

import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { fieldErrors } from '../lib/validation.js';
import { fail } from '../view/http/respond.js';

const invalid = (message, details) => [400, { code: 'VALIDATION_ERROR', message, details }];
const tooLarge = (message, details) => [413, { code: 'PAYLOAD_TOO_LARGE', message, details }];

/** The rule a path broke, as Mongoose names it (required, enum, …); a schema's own validators have no name. */
const broken = (e) => (e.kind && e.kind !== 'user defined' ? e.kind : 'value');

/** The status and the error of an answer to a mistake in the request; null when the fault is the server's. */
function answerTo(err) {
  // A handler refused the request on purpose: its own status and code.
  if (err instanceof ApiError) return [err.status, err];

  // validate() found fields that don't fit their schema.
  if (err instanceof ZodError) {
    const { message, details } = fieldErrors(err);
    return invalid(message, details);
  }

  // A document broke its Mongoose schema's rules: which paths, and which rule each broke.
  if (err instanceof mongoose.Error.ValidationError) {
    return invalid('Some values can\'t be saved.', Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, broken(e)])));
  }

  // A value that can't be an ObjectId names nothing, like an id that isn't there.
  if (err instanceof mongoose.Error.CastError) return [404, { code: 'NOT_FOUND', message: 'Not found.' }];

  // MongoDB's duplicate key error: a unique index already holds this value.
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern ?? {}).filter((field) => field !== 'userId');
    return [409, { code: 'CONFLICT', message: 'That already exists.', details: fields.length ? Object.fromEntries(fields.map((field) => [field, 'taken'])) : undefined }];
  }

  // Multer stopped at one of its limits (middleware/upload.js).
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return tooLarge('Images are at most 5 MB each.', { [err.field]: 'size' });
    return invalid('The form has a file or field it shouldn\'t have.', err.field ? { [err.field]: 'unexpected' } : undefined);
  }

  // express.json() couldn't parse the body, such as {bad, or stopped at its 100 kb limit.
  if (err.type === 'entity.parse.failed') return invalid('The request body isn\'t valid JSON.');
  if (err.type === 'entity.too.large') return tooLarge('The request body is over the 100 kb limit.');

  // Express's own libraries mark other mistakes in the request with a 4xx
  // `status`: a body in an unsupported charset, or a broken %-escape in the
  // URL (/trade/%E0%A4).
  if (err.status >= 400 && err.status < 500) return invalid(err.message);

  return null;
}

export function errorHandler(err, req, res, next) {
  // The response has already started (a file stream broke halfway, say).
  // Only Express's default handler can end it, by closing the connection.
  if (res.headersSent) return next(err);

  const answer = answerTo(err);
  if (answer) return fail(res, ...answer);

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
