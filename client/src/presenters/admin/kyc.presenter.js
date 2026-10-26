// useAdminKycPresenter (section 5, AdminKycPage): identity checks by status
// (Pending oldest first; Approved and Rejected newest decision first), twenty
// to a page from GET /admin/kyc, and one application open beside the list.
// Opening it fetches the document image (written to the audit log; the mock
// sends a placeholder). Approve, or reject with the reason the person sees.

import * as adminApi from '../../models/api/admin.api.js';
import { createPresenter, every } from '../shared/presenter.js';
import { toast, errorToast } from '../shared/toasts.js';
import { queuesChanged } from '../shared/navbar.presenter.js';
import { age, birthDate, dayMonth, dayTime, hourMinute, waited } from '../formatters/date.format.js';
import { countryName, documentLabel } from '../formatters/status.format.js';

const PAGE = 20;
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
  let image = { id: null, status: 'idle', selfie: 'idle' };
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

  async function fetchImage(id, kind) {
    try {
      await adminApi.kycDocument(id, kind);
      if (image.id !== id) return;
      image = { ...image, [kind === 'selfie' ? 'selfie' : 'status']: 'ready' };
    } catch {
      if (image.id !== id) return;
      image = { ...image, [kind === 'selfie' ? 'selfie' : 'status']: 'error' };
    }
    p.changed();
  }

  function open(id) {
    openId = id;
    rejecting = null;
    image = { id, status: id ? 'loading' : 'idle', selfie: 'idle' };
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
    return {
      key: k.id,
      name: k.userDisplayName ?? k.fullName,
      meta: pending
        ? `Sent ${dayTime(k.createdAt)} · waiting ${waited(k.createdAt)}${since}`
        : `Sent ${dayTime(k.createdAt)} · ${k.status === 'approved' ? 'approved' : 'rejected'} ${dayTime(k.reviewedAt)}${since}`,
      facts: [
        { key: 'name', label: 'Full legal name', value: k.fullName },
        { key: 'dob', label: 'Date of birth', value: `${birthDate(k.dateOfBirth)} · ${age(k.dateOfBirth)} years` },
        { key: 'country', label: 'Country', value: countryName(k.country) },
        { key: 'document', label: 'Document', value: documentLabel(k.documentType), mono: `••••${k.documentNumberLast4}` },
      ],
      image: image.id === k.id ? image.status : 'loading',
      selfie: k.hasSelfie ? (image.id === k.id ? image.selfie : 'idle') : null,
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
        if (!k || !k.hasSelfie) return;
        image = { ...image, selfie: 'loading' };
        p.changed();
        fetchImage(k.id, 'selfie');
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
