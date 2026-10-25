// KYC endpoints (section 4, KYC).

import { get, post } from './http.js';

/** -> { status, application } */
export const mine = () => get('/kyc/me');

/** Multipart, as the real endpoint takes. -> { application } (201) */
export function submit({ fullName, dateOfBirth, country, documentType, documentNumber, documentImage, selfieImage }) {
  const form = new FormData();
  form.set('fullName', fullName);
  form.set('dateOfBirth', dateOfBirth);
  form.set('country', country);
  form.set('documentType', documentType);
  form.set('documentNumber', documentNumber);
  if (documentImage) form.set('documentImage', documentImage);
  if (selfieImage) form.set('selfieImage', selfieImage);
  return post('/kyc', form);
}
