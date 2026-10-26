// useAdminWithdrawalsPresenter (section 5, AdminWithdrawalsPage): withdrawal
// requests by status (Pending oldest first; Completed and Rejected newest
// decision first), twenty to a page from GET /admin/withdrawals, each with
// the person's identity check. Approve after a confirmation, or reject with
// the reason the person sees; both reload the sidebar's counts.

import * as adminApi from '../../models/api/admin.api.js';
import { createPresenter, every } from '../shared/presenter.js';
import { toast, errorToast } from '../shared/toasts.js';
import { queuesChanged } from '../shared/navbar.presenter.js';
import { walletAmount } from '../wallet/deposit.presenter.js';
import { shortAddress } from '../formatters/number.format.js';
import { listTime, waited } from '../formatters/date.format.js';
import { kycShort } from '../formatters/status.format.js';

const PAGE = 20;
const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
];

/** "✓ KYC approved" under the name; anything else is worth a second look. */
function kycLine(status) {
  const base = kycShort(status);
  return status === 'none'
    ? { label: 'No KYC', marker: 'cross', tone: 'sell' }
    : { ...base, label: `KYC ${base.label.toLowerCase()}` };
}

export function createAdminWithdrawalsPresenter() {
  const p = createPresenter();
  let tab = 'pending';
  let page = 1;
  let list = { status: 'loading', items: [], total: 0, page: 1 };
  let pendingCount = null;
  let confirming = null;
  let rejecting = null;
  let busyId = null;
  let token = 0;

  async function load() {
    const mine = ++token;
    if (list.status !== 'ready') list = { ...list, status: 'loading' };
    p.changed();
    try {
      const data = await adminApi.withdrawals({ status: tab, page, limit: PAGE });
      if (mine !== token || p.disposed) return;
      list = { status: 'ready', items: data.items, total: data.total, page: data.page };
      if (tab === 'pending') pendingCount = data.total;
    } catch {
      if (mine !== token || p.disposed) return;
      list = { ...list, status: 'error' };
    }
    p.changed();
  }
  load();
  every(p, 30000, load);
  every(p, 15000, () => p.changed());

  const find = (id) => list.items.find((t) => t.id === id) ?? null;
  const who = (t) => t.userDisplayName ?? t.userEmail ?? 'This person';

  async function decide(id, body) {
    busyId = id;
    p.changed();
    try {
      await adminApi.decideWithdrawal(id, body);
      queuesChanged();
      await load();
      return true;
    } finally {
      busyId = null;
      p.changed();
    }
  }

  return {
    get vm() {
      const pending = tab === 'pending';
      return {
        tab,
        tabs: TABS.map((t) => ({ ...t, count: t.key === 'pending' ? pendingCount : null, current: t.key === tab, controls: 'withdrawals-list' })),
        status: list.status,
        rows: list.items.map((t, i) => ({
          key: t.id,
          requested: listTime(t.createdAt),
          waited: pending ? `waiting ${waited(t.createdAt)}` : null,
          oldest: pending && list.page === 1 && i === 0,
          user: who(t),
          kyc: kycLine(t.userKycStatus),
          asset: t.asset,
          amount: walletAmount(t.asset, t.amount),
          fee: walletAmount(t.asset, t.fee),
          receive: walletAmount(t.asset, t.receiveAmount ?? t.amount),
          address: t.address ? shortAddress(t.address) : '—',
          addressFull: t.address,
          decided: t.reviewedAt ? listTime(t.reviewedAt) : null,
          hash: t.txHash ? shortAddress(t.txHash) : null,
          hashFull: t.txHash,
          reason: t.rejectReason,
          busy: busyId === t.id,
        })),
        summary: list.total ? `${list.items.length} of ${list.total}, ${pending ? 'oldest' : 'newest'} first` : '',
        empty: pending ? 'Nothing waiting. New requests show here.' : `No ${tab} withdrawals yet.`,
        pagination: { pages: Math.max(1, Math.ceil(list.total / PAGE)), current: page },
        confirm: confirming,
        reject: rejecting,
      };
    },
    actions: {
      setTab(key) {
        if (key === tab) return;
        tab = key;
        page = 1;
        list = { status: 'loading', items: [], total: 0, page: 1 };
        load();
      },
      setPage(n) {
        page = n;
        load();
      },
      retry: () => load(),
      askApprove(id) {
        const t = find(id);
        if (!t) return;
        confirming = {
          id,
          title: `Approve ${who(t)}'s withdrawal?`,
          body: `${walletAmount(t.asset, t.receiveAmount ?? t.amount)} ${t.asset} goes to ${shortAddress(t.address)} and the ${walletAmount(t.asset, t.fee)} ${t.asset} fee is taken. This can't be undone.`,
          busy: false,
        };
        p.changed();
      },
      cancelApprove() {
        confirming = null;
        p.changed();
      },
      async confirmApprove() {
        if (!confirming || confirming.busy) return;
        const t = find(confirming.id);
        confirming = { ...confirming, busy: true };
        p.changed();
        try {
          await decide(confirming.id, { decision: 'approve' });
          toast({ title: 'Withdrawal approved', body: t ? `${walletAmount(t.asset, t.receiveAmount ?? t.amount)} ${t.asset} is on its way to ${who(t)}.` : '', tone: 'success' });
          confirming = null;
        } catch (err) {
          confirming = confirming ? { ...confirming, busy: false } : null;
          errorToast('The withdrawal wasn\'t approved', err);
        }
        p.changed();
      },
      startReject(id) {
        rejecting = { id, reason: '', error: null, busy: false, name: who(find(id) ?? {}) };
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
        if (!rejecting || rejecting.busy) return;
        const reason = rejecting.reason.trim();
        if (!reason) {
          rejecting = { ...rejecting, error: 'Give the reason the person will see.' };
          p.changed();
          return;
        }
        const t = find(rejecting.id);
        rejecting = { ...rejecting, busy: true };
        p.changed();
        try {
          await decide(rejecting.id, { decision: 'reject', reason });
          toast({ title: 'Withdrawal rejected', body: t ? `${walletAmount(t.asset, t.amount)} ${t.asset} is back in ${who(t)}'s wallet.` : '', tone: 'info' });
          rejecting = null;
        } catch (err) {
          if (rejecting) rejecting = { ...rejecting, busy: false, error: err?.details?.reason ? err.message : null };
          if (!err?.details?.reason) errorToast('The withdrawal wasn\'t rejected', err);
        }
        p.changed();
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
