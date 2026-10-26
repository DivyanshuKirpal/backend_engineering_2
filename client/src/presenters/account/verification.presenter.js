// useVerificationPresenter (section 5, VerificationPage): the identity check's
// status and its three steps, from GET /kyc/me; the form while there is
// nothing to review (not started, or rejected and sent again), posted as
// multipart to POST /kyc; and a summary of the application once it is sent.
// The form alone asks for the "sample document" tick (section 7, Rules the
// screens state).

import * as kycApi from '../../models/api/kyc.api.js';
import * as userApi from '../../models/api/user.api.js';
import { session, setUser } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { toast, errorToast } from '../shared/toasts.js';
import { countryOptions, DEFAULT_COUNTRY } from '../shared/countries.js';
import { age, birthDate, dayTime } from '../formatters/date.format.js';
import { fileSize } from '../formatters/number.format.js';
import { kycStatus, countryName, documentLabel } from '../formatters/status.format.js';

const DOCUMENT_TYPES = ['passport', 'national_id', 'driving_licence'];
const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MAX_IMAGE = 5 * 1024 * 1024;

const STEPS = [
  { key: 'send', title: 'Send your details', body: 'About two minutes.' },
  { key: 'review', title: 'An admin reviews them', body: 'You\'ll get a notification either way.' },
  { key: 'open', title: 'Withdrawals open', body: 'If it\'s rejected, you can send it again.' },
];

/** Which step each status is at: steps before it are done. */
const AT = { none: 0, rejected: 0, pending: 1, approved: 3 };

/** Digits typed as DD / MM / YYYY, the separators added as they come. */
function maskDate(value) {
  const d = String(value).replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join(' / ');
}

/** DD / MM / YYYY as YYYY-MM-DD, or null when it isn't a real date. */
function isoDate(masked) {
  const d = String(masked).replace(/\D/g, '');
  if (d.length !== 8) return null;
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

function imageProblem(file, { required }) {
  if (!file) return required ? 'Add a photo of the document.' : null;
  if (!IMAGE_TYPES.includes(file.type)) return 'Images must be JPEG or PNG.';
  if (file.size > MAX_IMAGE) return 'Images are at most 5 MB each.';
  return null;
}

export function createVerificationPresenter() {
  const p = createPresenter();
  let kyc = { status: 'loading', state: null, application: null };
  let form = null;
  let errors = {};
  let busy = false;

  function blankForm(previous) {
    return {
      fullName: previous?.fullName ?? '',
      dob: previous?.dateOfBirth ? maskDate(previous.dateOfBirth.split('-').reverse().join('')) : '',
      country: previous?.country ?? DEFAULT_COUNTRY,
      documentType: previous?.documentType ?? 'passport',
      documentNumber: '',
      documentImage: null,
      selfieImage: null,
      sample: false,
    };
  }

  async function load() {
    try {
      const data = await kycApi.mine();
      if (p.disposed) return;
      kyc = { status: 'ready', state: data.status, application: data.application };
      form = data.status === 'none' || data.status === 'rejected' ? form ?? blankForm(data.status === 'rejected' ? data.application : null) : null;
    } catch {
      if (p.disposed) return;
      kyc = { ...kyc, status: 'error' };
    }
    p.changed();
  }
  load();

  function check() {
    const e = {};
    const name = form.fullName.trim();
    if (!name) e.fullName = 'Enter your name as printed on the document.';
    else if (name.length < 2) e.fullName = 'Enter your full name.';
    const iso = isoDate(form.dob);
    if (!form.dob) e.dob = 'Enter your date of birth.';
    else if (!iso) e.dob = 'Enter a real date: DD / MM / YYYY.';
    else if (age(iso) < 18) e.dob = 'You need to be 18 or older.';
    else if (age(iso) > 120) e.dob = 'Enter a real date: DD / MM / YYYY.';
    if (!DOCUMENT_TYPES.includes(form.documentType)) e.documentType = 'Choose a document type.';
    const number = form.documentNumber.replace(/\s+/g, '');
    if (!number) e.documentNumber = 'Enter the document number.';
    else if (number.length < 5) e.documentNumber = 'Document numbers are at least 5 characters.';
    e.documentImage = imageProblem(form.documentImage, { required: true });
    e.selfieImage = imageProblem(form.selfieImage, { required: false });
    if (!form.sample) e.sample = 'Tick the box to go on: this simulator takes sample documents only.';
    return e;
  }

  const set = (key, value) => {
    form = { ...form, [key]: value };
    if (errors[key]) errors = { ...errors, [key]: null };
    p.changed();
  };

  const file = (f) => (f ? { name: f.name, size: fileSize(f.size) } : null);

  function applicationVm(a) {
    if (!a || kyc.state === 'none') return null;
    return {
      facts: [
        { key: 'name', label: 'Full legal name', value: a.fullName },
        { key: 'dob', label: 'Date of birth', value: birthDate(a.dateOfBirth) },
        { key: 'country', label: 'Country', value: countryName(a.country) },
        { key: 'document', label: 'Document', value: `${documentLabel(a.documentType)} ending ${a.documentNumberLast4}` },
        { key: 'sent', label: 'Sent', value: dayTime(a.createdAt) },
        a.reviewedAt ? { key: 'reviewed', label: 'Reviewed', value: dayTime(a.reviewedAt) } : null,
      ].filter(Boolean),
    };
  }

  return {
    get vm() {
      if (kyc.status === 'error') return { status: 'error' };
      if (kyc.status !== 'ready') return { status: 'loading' };
      const at = AT[kyc.state] ?? 0;
      const reason = kyc.application?.rejectReason ?? null;
      return {
        status: 'ready',
        badge: kycStatus(kyc.state, reason),
        steps: STEPS.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'now' : 'next';
          return { ...s, number: String(i + 1).padStart(2, '0'), state, when: state === 'next' ? null : state };
        }),
        rejected: kyc.state === 'rejected' ? `An admin turned it down: ${reason ?? 'no reason given'}. Fix that and send it again.` : null,
        approved: kyc.state === 'approved' ? { text: 'Withdrawals are open.', href: '/wallet/withdraw', label: 'Withdraw' } : null,
        application: form ? null : applicationVm(kyc.application),
        form: form
          ? {
            ...form,
            countryOptions: countryOptions(),
            documentTypeOptions: DOCUMENT_TYPES.map((value) => ({ value, label: documentLabel(value) })),
            documentImage: file(form.documentImage),
            selfieImage: file(form.selfieImage),
            errors,
            busy,
          }
          : null,
      };
    },
    actions: {
      retry() {
        kyc = { ...kyc, status: 'loading' };
        p.changed();
        load();
      },
      setFullName: (v) => set('fullName', v),
      setDob: (v) => set('dob', maskDate(v)),
      setCountry: (v) => set('country', v),
      setDocumentType: (v) => set('documentType', v),
      setDocumentNumber: (v) => set('documentNumber', v),
      setDocumentImage: (f) => {
        set('documentImage', f ?? null);
        if (f) errors = { ...errors, documentImage: imageProblem(f, { required: true }) };
      },
      setSelfieImage: (f) => {
        set('selfieImage', f ?? null);
        if (f) errors = { ...errors, selfieImage: imageProblem(f, { required: false }) };
      },
      setSample: (on) => set('sample', Boolean(on)),
      async submit() {
        if (!form || busy) return;
        errors = check();
        if (Object.values(errors).some(Boolean)) {
          p.changed();
          return;
        }
        busy = true;
        p.changed();
        try {
          await kycApi.submit({
            fullName: form.fullName.trim(),
            dateOfBirth: isoDate(form.dob),
            country: form.country,
            documentType: form.documentType,
            documentNumber: form.documentNumber.replace(/\s+/g, ''),
            documentImage: form.documentImage,
            selfieImage: form.selfieImage,
          });
          toast({ title: 'Sent for review', body: 'You\'ll get a notification when an admin decides.', tone: 'success' });
          form = null;
          errors = {};
          const { user } = await userApi.me();
          if (session.get().user?.id === user.id) setUser(user);
          await load();
        } catch (err) {
          const field = Object.keys(err?.details ?? {})[0];
          const map = { dateOfBirth: 'dob', fullName: 'fullName', country: 'country', documentType: 'documentType', documentNumber: 'documentNumber', documentImage: 'documentImage', selfieImage: 'selfieImage' };
          if (map[field]) errors = { ...errors, [map[field]]: err.message };
          else errorToast('Your details weren\'t sent', err);
        } finally {
          busy = false;
          p.changed();
        }
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
