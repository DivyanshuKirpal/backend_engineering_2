// KYC routes (section 4, kyc.routes.js). By the time a handler runs, the form's
// images are read and checked (middleware/upload.js) and its fields validated.

import { badRequest, conflict } from '../../lib/errors.js';
import * as session from '../../model/exchange/session.js';
import { db, newId, persist } from '../../model/store.js';
import { removeImages, saveKycImage } from '../../model/uploads.js';
import { kycDto } from '../mappers.js';

/** One open application per user. */
function refuseSecond(user) {
  if (db().kyc.some((k) => k.userId === user.id && (k.status === 'pending' || k.status === 'approved'))) {
    throw conflict('You already have an application open.');
  }
}

export default [
  ['GET', '/kyc/me', (ctx) => {
    const user = session.requireUser(ctx);
    const latest = db().kyc.filter((k) => k.userId === user.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    return { data: { status: user.kycStatus, application: latest ? kycDto(latest) : null } };
  }],

  ['POST', '/kyc', async (ctx) => {
    const user = session.requireUser(ctx);
    const { fullName, dateOfBirth, country, documentType, documentNumber, documentImage, selfieImage } = ctx.body;
    if (!documentImage) throw badRequest('Add a photo of the document.', { documentImage: 'required' });
    refuseSecond(user);

    const id = newId();
    const images = {
      document: await saveKycImage(user.id, id, 'document', documentImage),
      selfie: selfieImage ? await saveKycImage(user.id, id, 'selfie', selfieImage) : null,
    };
    try {
      refuseSecond(user); // another one may have come in while the files were written
    } catch (err) {
      await removeImages(Object.values(images));
      throw err;
    }

    const app = {
      id, status: 'pending',
      fullName, dateOfBirth, country, documentType,
      documentNumberLast4: documentNumber.replace(/\s+/g, '').slice(-4).toUpperCase(),
      rejectReason: null, createdAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null,
      hasSelfie: Boolean(images.selfie), images,
      userId: user.id, userEmail: user.email, userDisplayName: user.displayName, userCreatedAt: user.createdAt,
    };
    db().kyc.push(app);
    user.kycStatus = 'pending';
    session.audit(ctx, user, 'kyc.submitted', { targetType: 'kyc', targetId: app.id });
    persist();
    return { status: 201, data: { application: kycDto(app) } };
  }],
];
