// KYC routes (section 4, kyc.routes.js). Images are only checked for type and
// size; the mock keeps their file names, never their contents.

import { db, newId, persist } from '../db.js';
import { badRequest, conflict } from '../errors.js';
import { kycDto } from '../mappers.js';
import * as session from '../session.js';
import { requireFields } from '../util.js';

const DOCUMENT_TYPES = ['passport', 'national_id', 'driving_licence'];
const MAX_IMAGE = 5 * 1024 * 1024;

function checkImage(file, field, required) {
  if (!file) {
    if (required) throw badRequest('Add a photo of the document.', { [field]: 'required' });
    return null;
  }
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw badRequest('Images must be JPEG or PNG.', { [field]: 'type' });
  return file.name;
}

function age(dateOfBirth) {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

export default [
  ['GET', '/kyc/me', (ctx) => {
    const user = session.requireUser(ctx);
    const latest = db().kyc.filter((k) => k.userId === user.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    return { data: { status: user.kycStatus, application: latest ? kycDto(latest) : null } };
  }],

  ['POST', '/kyc', (ctx) => {
    const user = session.requireUser(ctx);
    const body = ctx.body ?? {};
    requireFields(body, ['fullName', 'dateOfBirth', 'country', 'documentType', 'documentNumber']);
    if (db().kyc.some((k) => k.userId === user.id && (k.status === 'pending' || k.status === 'approved'))) {
      throw conflict('You already have an application open.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth) || Number.isNaN(Date.parse(body.dateOfBirth))) {
      throw badRequest('Enter a real date of birth.', { dateOfBirth: 'format' });
    }
    if (age(body.dateOfBirth) < 18) throw badRequest('You need to be 18 or older.', { dateOfBirth: 'age' });
    if (!/^[A-Z]{2}$/.test(body.country)) throw badRequest('Choose a country.', { country: 'format' });
    if (!DOCUMENT_TYPES.includes(body.documentType)) throw badRequest('Choose a document type.', { documentType: 'value' });
    const number = String(body.documentNumber).replace(/\s+/g, '');
    if (number.length < 5) throw badRequest('Document numbers are at least 5 characters.', { documentNumber: 'length' });
    if (body.documentImage?.size > MAX_IMAGE || body.selfieImage?.size > MAX_IMAGE) {
      throw badRequest('Images are at most 5 MB each.', { documentImage: 'size' });
    }
    checkImage(body.documentImage, 'documentImage', true);
    const selfie = checkImage(body.selfieImage, 'selfieImage', false);

    const app = {
      id: newId(), status: 'pending',
      fullName: String(body.fullName).trim(), dateOfBirth: body.dateOfBirth, country: body.country,
      documentType: body.documentType, documentNumberLast4: number.slice(-4).toUpperCase(),
      rejectReason: null, createdAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null,
      hasSelfie: Boolean(selfie),
      userId: user.id, userEmail: user.email, userDisplayName: user.displayName, userCreatedAt: user.createdAt,
    };
    db().kyc.push(app);
    user.kycStatus = 'pending';
    session.audit(user, 'kyc.submitted', { targetType: 'kyc', targetId: app.id });
    persist();
    return { status: 201, data: { application: kycDto(app) } };
  }],
];
