// The identity form's images: multipart/form-data, read by Multer into memory
// (they are small, and nothing reaches the disk before it has been checked).
// JPEG or PNG, at most 5 MB each. The type a browser states is only a label, so
// the file's first bytes must say the same.

import multer from 'multer';
import { ApiError, badRequest } from '../lib/errors.js';

export const MAX_IMAGE = 5 * 1024 * 1024;

const SIGNATURES = new Map([
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
]);

const wrongType = (field) => badRequest('Images must be JPEG or PNG.', { [field]: 'type' });

const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE, files: 2, fields: 20, fieldSize: 10 * 1024 },
  // Refuses a file by its stated type, before any of it is read
  fileFilter: (req, file, done) => (SIGNATURES.has(file.mimetype) ? done(null, true) : done(wrongType(file.fieldname))),
}).fields([{ name: 'documentImage', maxCount: 1 }, { name: 'selfieImage', maxCount: 1 }]);

/** Fields go on req.body, files on req.files. A form that can't be read is the client's mistake, so 400. */
function read(req, res, next) {
  multipart(req, res, (err) => {
    if (!err || err instanceof ApiError || err instanceof multer.MulterError) return next(err);
    return next(badRequest('The form couldn\'t be read. Send it again.'));
  });
}

function checkContents(req, res, next) {
  for (const [file] of Object.values(req.files ?? {})) {
    if (!SIGNATURES.get(file.mimetype).every((byte, i) => file.buffer[i] === byte)) throw wrongType(file.fieldname);
  }
  next();
}

export const kycImages = [read, checkContents];
