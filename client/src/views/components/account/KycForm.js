// KycForm (section 5; board Account · Verification): name, date of birth and
// country; the document type, its number and a photo of it, with an optional
// selfie; and the tick for "This is a sample document". KycApplication shows
// what was sent once it is under review or decided (not drawn yet).

import { h } from '../../dom.js';
import { Panel } from '../ui/Panel.js';
import { Field, Select, Checkbox, RadioCards } from '../ui/Field.js';
import { FileDrop } from '../ui/FileDrop.js';

/** f: the verification presenter's form vm. */
export function KycForm(f, actions) {
  return Panel({
    as: 'form',
    label: 'Your details',
    labelId: 'kyc-form-label',
    className: 'kyc-form',
    onSubmit: (e) => {
      e.preventDefault();
      actions.submit();
    },
    foot: [
      h('p', { class: 'panel-foot-note' }, 'Only admins can open your images, and every time one does it goes in the audit log.'),
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: f.busy }, f.busy ? 'Sending…' : 'Submit for review'),
    ],
  },
  h('div', { class: 'kyc-row' },
    Field({ id: 'kyc-name', label: 'Full legal name', placeholder: 'As printed on the document', value: f.fullName, error: f.errors.fullName, autocomplete: 'name', onInput: actions.setFullName }),
    Field({ id: 'kyc-dob', label: 'Date of birth', placeholder: 'DD / MM / YYYY', value: f.dob, error: f.errors.dob, hint: 'You need to be 18 or older.', inputmode: 'numeric', autocomplete: 'bday', maxlength: 14, onInput: actions.setDob }),
    Select({ id: 'kyc-country', label: 'Country', value: f.country, options: f.countryOptions, error: f.errors.country, onChange: actions.setCountry })),
  RadioCards({ name: 'kyc-document-type', legend: 'Document type', value: f.documentType, options: f.documentTypeOptions, error: f.errors.documentType, onChange: actions.setDocumentType }),
  h('div', { class: 'kyc-number' },
    Field({ id: 'kyc-number', label: 'Document number', value: f.documentNumber, error: f.errors.documentNumber, hint: 'We keep only the last 4 characters.', autocomplete: 'off', onInput: actions.setDocumentNumber })),
  h('div', { class: 'kyc-files' },
    FileDrop({ id: 'kyc-document', label: 'Photo of the document', file: f.documentImage, error: f.errors.documentImage, hint: 'JPEG or PNG, up to 5 MB', icon: 'upload', onFile: actions.setDocumentImage }),
    FileDrop({ id: 'kyc-selfie', label: 'Selfie holding it · optional', file: f.selfieImage, error: f.errors.selfieImage, hint: 'JPEG or PNG, up to 5 MB', icon: 'user', optional: true, onFile: actions.setSelfieImage })),
  Checkbox({ id: 'kyc-sample', label: 'This is a sample document, not a real ID.', checked: f.sample, error: f.errors.sample, onChange: actions.setSample }));
}

/** app: { facts: [{ key, label, value }] } */
export function KycApplication(app) {
  return Panel({ label: 'Your application', labelId: 'kyc-application-label', className: 'kyc-application' },
    h('dl', { class: 'kyc-facts' }, app.facts.map((f) => h('div', { key: f.key }, h('dt', { class: 'field-label' }, f.label), h('dd', {}, f.value)))),
    h('p', { class: 'undesigned-note' }, 'Not drawn yet: what was sent, once it is under review.'));
}
