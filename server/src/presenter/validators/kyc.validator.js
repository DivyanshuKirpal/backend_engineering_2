// What the identity form may send. Its images are checked by middleware/upload.js.

import { z } from 'zod';
import { rule } from '../../lib/validation.js';
import { oneOf, text } from './rules.js';

/** A date that exists: 2001-02-31 would read back as 3 March. */
function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function age(dateOfBirth) {
  const born = new Date(`${dateOfBirth}T00:00:00Z`);
  const now = new Date();
  const hadBirthday = now.getUTCMonth() > born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() >= born.getUTCDate());
  return now.getUTCFullYear() - born.getUTCFullYear() - (hadBirthday ? 0 : 1);
}

export const submit = z.object({
  fullName: text('Enter your name.', { max: 100 }),
  dateOfBirth: text('Enter your date of birth.')
    .refine(isRealDate, { error: rule('format', 'Enter a real date of birth.'), abort: true })
    .refine((value) => age(value) >= 18, rule('age', 'You need to be 18 or older.')),
  country: text('Choose a country.').regex(/^[A-Z]{2}$/, rule('format', 'Choose a country.')),
  documentType: oneOf(['passport', 'national_id', 'driving_licence'], 'Choose a document type.'),
  documentNumber: text('Enter the document number.', { max: 40 })
    .refine((value) => value.replace(/\s+/g, '').length >= 5, rule('length', 'Document numbers are at least 5 characters.')),
});
