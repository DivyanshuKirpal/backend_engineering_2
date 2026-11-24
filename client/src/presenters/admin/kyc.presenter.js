// useAdminKycPresenter (section 5, AdminKycPage): identity checks by status
// (Pending oldest first; Approved and Rejected newest decision first), twenty
// to a page from GET /admin/kyc, and one application open beside the list.
// Opening it fetches the document image, which the server writes to the audit
// log; a seeded application has none, so its frame keeps the drawn placeholder.
// Approve, or reject with the reason the person sees.

import * as adminApi from '../../models/api/admin.api.js';
import { createPresenter, every } from '../shared/presenter.js';
import { toast, errorToast } from '../shared/toasts.js';
import { queuesChanged } from '../shared/navbar.presenter.js';
import { age, birthDate, dayMonth, dayTime, hourMinute, waited } from '../formatters/date.format.js';
import { countryName, documentLabel } from '../formatters/status.format.js';

const PAGE = 20;
const CLOSED = { status: 'idle', src: null };
const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export function createAdminKycPresenter() {
  const p = createPresenter();
  let tab = 'pending';
  let page = 1;
  let list = { status: 'loading', items: [], total: 0 };
  let pendingCount = null;
  let openId = null;
  let images = { id: null, document: CLOSED, selfie: CLOSED };
  let deciding = false;
  let rejecting = null;
  let token = 0;

  async function load({ keepOpen = false } = {}) {
    const mine = ++token;
    if (list.status !== 'ready') list = { ...list, status: 'loading' };
    p.changed();
    try {
      const data = await adminApi.kyc({ status: tab, page, limit: PAGE });
      if (mine !== token || p.disposed) return;
      list = { status: 'ready', items: data.items, total: data.total };
      if (tab === 'pending') pendingCount = data.total;
      if (!keepOpen || !data.items.some((k) => k.id === openId)) open(data.items[0]?.id ?? null);
    } catch {
      if (mine !== token || p.disposed) return;
      list = { ...list, status: 'error' };
    }
    p.changed();
  }
  load();
  every(p, 30000, () => load({ keepOpen: true }));
  every(p, 15000, () => p.changed());

  // An <img> can't send the access token, so each image is fetched and shown from
  // an object URL, which holds it in memory until it is revoked. Nobody's document
  // stays behind once its application is closed.
  function show(kind, next) {
    const { src } = images[kind];
    if (src && src !== next.src) URL.revokeObjectURL(src);
    images = { ...images, [kind]: next };
    p.changed();
  }
  function release() {
    show('document', CLOSED);
    show('selfie', CLOSED);
  }
  p.own(release);

  async function fetchImage(id, kind) {
    show(kind, { status: 'loading', src: null });
    const closed = () => p.disposed || images.id !== id;
    try {
      const blob = await adminApi.kycDocument(id, kind);
      if (!closed()) show(kind, { status: 'ready', src: blob && URL.createObjectURL(blob) });
    } catch {
      if (!closed()) show(kind, { status: 'error', src: null });
    }
  }

  function open(id) {
    openId = id;
    rejecting = null;
    release();
    images = { ...images, id };
    if (id) fetchImage(id, 'document');
    p.changed();
  }

  const current = () => list.items.find((k) => k.id === openId) ?? null;

  function row(k, i) {
    const pending = k.status === 'pending';
    return {
      key: k.id,
      name: k.userDisplayName ?? k.fullName,
      country: countryName(k.country),
      document: documentLabel(k.documentType),
      sent: hourMinute(k.createdAt),
      decided: k.reviewedAt ? dayTime(k.reviewedAt) : '—',
      waited: pending ? waited(k.createdAt) : null,
      reason: k.rejectReason,
      oldest: pending && page === 1 && i === 0,
      current: k.id === openId,
    };
  }

  function review(k) {
    if (!k) return null;
    const pending = k.status === 'pending';
    const since = k.userCreatedAt ? ` · account since ${dayMonth(k.userCreatedAt)}` : '';
    const name = k.userDisplayName ?? k.fullName;
    const mine = images.id === k.id ? images : { document: CLOSED, selfie: CLOSED };
    return {
      key: k.id,
      name,
      meta: pending
        ? `Sent ${dayTime(k.createdAt)} · waiting ${waited(k.createdAt)}${since}`
        : `Sent ${dayTime(k.createdAt)} · ${k.status === 'approved' ? 'approved' : 'rejected'} ${dayTime(k.reviewedAt)}${since}`,
      facts: [
        { key: 'name', label: 'Full legal name', value: k.fullName },
        { key: 'dob', label: 'Date of birth', value: `${birthDate(k.dateOfBirth)} · ${age(k.dateOfBirth)} years` },
        { key: 'country', label: 'Country', value: countryName(k.country) },
        { key: 'document', label: 'Document', value: documentLabel(k.documentType), mono: `••••${k.documentNumberLast4}` },
      ],
      image: { ...mine.document, alt: `${documentLabel(k.documentType)} sent by ${name}` },
      selfie: k.hasSelfie ? { ...mine.selfie, alt: `Selfie sent by ${name}` } : null,
      note: `${k.hasSelfie ? 'A selfie was sent too.' : 'No selfie sent.'} Opening these images is written to the audit log.`,
      decision: pending ? null : k.status === 'approved' ? { tone: 'buy', text: `Approved ${dayTime(k.reviewedAt)}.` } : { tone: 'sell', text: `Rejected ${dayTime(k.reviewedAt)}: ${k.rejectReason}` },
      deciding,
    };
  }

  return {
    get vm() {
      const pages = Math.max(1, Math.ceil(list.total / PAGE));
      return {
        tabs: TABS.map((t) => ({ ...t, count: t.key === 'pending' ? pendingCount : null, current: t.key === tab, controls: 'kyc-list' })),
        tab,
        status: list.status,
        heading: tab === 'pending' ? 'Waiting · oldest first' : tab === 'approved' ? 'Approved · newest first' : 'Rejected · newest first',
        rows: list.items.map(row),
        empty: tab === 'pending' ? 'Nobody is waiting. New applications show here.' : `No ${tab} applications yet.`,
        pagination: { pages, current: page },
        review: review(current()),
        reject: rejecting,
      };
    },
    actions: {
      setTab(key) {
        if (key === tab) return;
        tab = key;
        page = 1;
        list = { status: 'loading', items: [], total: 0 };
        open(null);
        load();
      },
      setPage(n) {
        page = n;
        load();
      },
      open,
      retry: () => load(),
      openSelfie() {
        const k = current();
        if (k?.hasSelfie) fetchImage(k.id, 'selfie');
      },
      /** The browser couldn't draw what the server sent: a file that only begins like an image. */
      imageFailed(src) {
        for (const kind of ['document', 'selfie']) if (images[kind].src === src) show(kind, { status: 'error', src: null });
      },
      async approve() {
        const k = current();
        if (!k || deciding) return;
        deciding = true;
        p.changed();
        try {
          await adminApi.decideKyc(k.id, { decision: 'approve' });
          toast({ title: 'Approved', body: `${k.userDisplayName ?? k.fullName} can withdraw now.`, tone: 'success' });
          queuesChanged();
          await load();
        } catch (err) {
          errorToast('The application wasn\'t approved', err);
        } finally {
          deciding = false;
          p.changed();
        }
      },
      startReject() {
        rejecting = { reason: '', error: null, busy: false };
        p.changed();
      },
      setReason(value) {
        if (!rejecting) return;
        rejecting = { ...rejecting, reason: value, error: null };
        p.changed();
      },
      cancelReject() {
        rejecting = null;
        p.changed();
      },
      async confirmReject() {
        const k = current();
        if (!k || !rejecting || rejecting.busy) return;
        const reason = rejecting.reason.trim();
        if (!reason) {
          rejecting = { ...rejecting, error: 'Give the reason the person will see.' };
          p.changed();
          return;
        }
        rejecting = { ...rejecting, busy: true };
        p.changed();
        try {
          await adminApi.decideKyc(k.id, { decision: 'reject', reason });
          toast({ title: 'Rejected', body: `${k.userDisplayName ?? k.fullName} sees the reason and can send it again.`, tone: 'info' });
          rejecting = null;
          queuesChanged();
          await load();
        } catch (err) {
          if (rejecting) rejecting = { ...rejecting, busy: false, error: err?.details?.reason ? err.message : null };
          if (!err?.details?.reason) errorToast('The application wasn\'t rejected', err);
          p.changed();
        }
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
