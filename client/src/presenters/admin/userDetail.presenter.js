// useAdminUserDetailPresenter (section 5, AdminUserDetailPage): one person
// from GET /admin/users/:id: who they are, their balances valued in USDT,
// their open orders and their recent deposits and withdrawals. Freeze or
// unfreeze with a reason (freezing cancels their open orders), or change
// their role after a confirmation. The last admin can't become a user, and
// an admin can't freeze or change their own account.

import * as money from '../../models/domain/money.js';
import { valuePortfolio } from '../../models/domain/portfolio.rules.js';
import * as adminApi from '../../models/api/admin.api.js';
import { tickers, loadMarkets, lastPrices, marketBySymbol } from '../../models/stores/ticker.store.js';
import { assets, loadAssets, assetByCode } from '../../models/stores/asset.store.js';
import { currentUser } from '../../models/stores/session.store.js';
import { createPresenter, every } from '../shared/presenter.js';
import { initials } from '../shared/navbar.presenter.js';
import { toast, errorToast } from '../shared/toasts.js';
import { walletAmount } from '../wallet/deposit.presenter.js';
import { inOrderTerms } from '../orders/orderLifecycle.js';
import { amount, fixed, pair, price as fmtPrice, qty, shortAddress, shortId } from '../formatters/number.format.js';
import { dayMonth, dayTime, fullDate, listTime } from '../formatters/date.format.js';
import { accountStatus, kycStatus, orderStatus, roleLabel, sideLabel, transactionStatus } from '../formatters/status.format.js';
import { tile, assetName } from '../formatters/asset.format.js';

const OPEN = new Set(['pending', 'open', 'partially_filled']);
const FREEZE_REASONS = ['Flooding the book with orders', 'Unusual withdrawals', 'Asked by the account holder'];
const UNFREEZE_REASONS = ['Reviewed and cleared', 'Asked by the account holder'];

/** Balances as the wallet shows them: zero is "0". */
const shown = (asset, value) => (money.isZero(value) ? '0' : asset === 'USDT' ? fixed(value, 2) : amount(value, assetByCode(asset)?.decimals ?? 8));

export function createAdminUserDetailPresenter({ id }) {
  const p = createPresenter();
  let detail = { status: 'loading' };
  let adminCount = null;
  let frozenBy = null;
  let roleChoice = null;
  let reasonDialog = null;
  let roleDialog = null;
  let token = 0;

  for (const store of [tickers, assets]) p.own(store.subscribe(() => p.changed()));
  loadMarkets();
  loadAssets();

  async function load() {
    const mine = ++token;
    try {
      const [data, admins] = await Promise.all([adminApi.user(id), adminApi.users({ role: 'admin', limit: 1 })]);
      // Why the account is frozen: the newest freeze in the audit log
      const freezes = data.user.status === 'frozen' ? await adminApi.auditLogs({ action: 'admin.user_frozen', limit: 100 }) : null;
      if (mine !== token || p.disposed) return;
      detail = { status: 'ready', ...data };
      adminCount = admins.total;
      frozenBy = freezes?.items.find((a) => a.targetId === id) ?? null;
      roleChoice ??= data.user.role;
    } catch (err) {
      if (mine !== token || p.disposed) return;
      detail = { status: err?.status === 404 ? 'missing' : 'error' };
    }
    p.changed();
  }
  load();
  // Their orders fill and their balances move while the page is open
  every(p, 30000, () => {
    if (!reasonDialog && !roleDialog) load();
  });

  const user = () => detail.user;
  const openOrders = () => (detail.recentOrders ?? []).filter((o) => OPEN.has(o.status));
  const self = () => currentUser()?.id === id;
  const lastAdmin = () => user()?.role === 'admin' && adminCount === 1;

  function profileVm(u, holdings) {
    const signIn = [u.hasPassword ? 'Password' : null, u.googleLinked ? 'Google' : null].filter(Boolean).join(' and ') || '—';
    return {
      initials: initials(u.displayName),
      admin: u.role === 'admin',
      name: u.displayName,
      email: u.email,
      facts: [
        { key: 'role', label: 'Role', value: roleLabel(u.role) },
        { key: 'status', label: 'Account', marker: accountStatus(u.status) },
        { key: 'email', label: 'Email', value: u.emailVerified ? 'Confirmed' : 'Not confirmed' },
        { key: 'kyc', label: 'Identity check', marker: kycStatus(u.kycStatus) },
        { key: 'twofa', label: 'Two-factor', value: u.twoFactorEnabled ? 'On' : 'Off' },
        { key: 'signin', label: 'Signs in with', value: signIn },
        { key: 'joined', label: 'Joined', value: fullDate(u.createdAt) },
        { key: 'login', label: 'Last login', value: u.lastLoginAt ? listTime(u.lastLoginAt) : 'Never' },
        { key: 'failed', label: 'Wrong passwords in a row', value: String(u.failedLoginCount ?? 0) },
        { key: 'holdings', label: 'Holdings', value: holdings == null ? '—' : `≈ ${fixed(holdings, 2)} USDT`, mono: true },
      ],
    };
  }

  function actionsVm(u) {
    const frozen = u.status === 'frozen';
    const count = openOrders().length;
    let statusNote;
    if (frozen) {
      statusNote = frozenBy
        ? `Frozen ${dayTime(frozenBy.createdAt)} by ${frozenBy.actor?.id === currentUser()?.id ? 'you' : frozenBy.actor?.email ?? 'an admin'}: ${frozenBy.metadata?.reason ?? 'no reason given'}.`
        : 'Frozen. No reason is on record.';
    } else {
      statusNote = count
        ? `Freezing cancels their ${count} open ${count === 1 ? 'order' : 'orders'} and stops them trading, depositing and withdrawing. They can still log in and look.`
        : 'Freezing stops them trading, depositing and withdrawing. They can still log in and look.';
    }
    let roleNote = null;
    if (lastAdmin()) roleNote = 'The only admin can\'t become a user. Make someone else an admin first.';
    else if (self()) roleNote = 'Another admin can change your role.';
    return {
      frozen,
      status: accountStatus(u.status),
      statusNote,
      statusButton: frozen ? 'Unfreeze account' : 'Freeze account',
      statusDisabled: self(),
      statusDisabledNote: self() ? 'You can\'t freeze your own account.' : null,
      isAdmin: u.role === 'admin',
      roleLabel: roleLabel(u.role),
      role: roleChoice ?? u.role,
      roleOptions: [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }],
      roleDisabled: self() || lastAdmin(),
      roleNote,
      roleChanged: (roleChoice ?? u.role) !== u.role,
    };
  }

  function orderRow(o) {
    const m = marketBySymbol(o.market);
    return {
      key: o.id,
      placed: listTime(o.createdAt),
      id: shortId(o.id),
      href: null,
      market: pair(o.market),
      side: sideLabel(o.side),
      tone: o.side,
      type: o.type,
      price: o.type === 'market' || !m ? 'Market' : fmtPrice(o.price, m.tickSize),
      amount: !m ? '—' : o.quantity ? `${qty(o.quantity, m.stepSize)} ${m.baseAsset}` : inOrderTerms(m, m.quoteAsset, o.quoteQuantity),
      filled: `${o.quantity && money.isPositive(o.quantity) ? money.pct(o.filledQuantity ?? '0', o.quantity, 0, 'down') : '0'}%`,
      total: o.price && o.quantity ? fixed(money.mul(o.price, o.quantity), 2) : o.quoteQuantity ? fixed(o.quoteQuantity, 2) : '—',
      status: orderStatus(o.status),
    };
  }

  function transactionRow(t) {
    const deposit = t.type === 'deposit';
    return {
      key: t.id,
      time: listTime(t.createdAt),
      type: deposit ? 'Deposit' : 'Withdrawal',
      asset: t.asset,
      amount: `${deposit ? '+' : '−'}${walletAmount(t.asset, t.amount)}`,
      tone: deposit ? 'buy' : 'sell',
      fee: deposit ? '—' : walletAmount(t.asset, t.fee),
      address: t.address ? shortAddress(t.address) : '—',
      addressFull: t.address,
      status: transactionStatus(t.status),
      reason: t.status === 'rejected' && t.rejectReason ? t.rejectReason : null,
    };
  }

  return {
    get vm() {
      if (detail.status !== 'ready') return { status: detail.status };
      const u = user();
      const priced = tickers.get().status === 'ready';
      const valued = priced ? valuePortfolio(detail.balances, lastPrices()) : null;
      const list = assets.get().list;
      return {
        status: 'ready',
        title: u.displayName,
        subtitle: `${u.email} · joined ${dayMonth(u.createdAt)}`,
        profile: profileVm(u, valued?.total ?? null),
        actions: actionsVm(u),
        balances: {
          rows: (valued?.rows ?? detail.balances).map((b) => ({
            key: b.asset,
            tile: tile(b.asset),
            code: b.asset,
            name: assetName(b.asset, list),
            total: shown(b.asset, b.total),
            free: shown(b.asset, b.available),
            held: shown(b.asset, b.locked),
            value: b.value == null ? '—' : fixed(b.value, 2),
          })),
          empty: 'No balances yet.',
        },
        openOrders: {
          label: `Open orders · ${openOrders().length}`,
          rows: openOrders().map(orderRow),
          empty: { title: 'No open orders', body: u.status === 'frozen' ? 'Freezing cancelled any they had, and they can\'t place new ones.' : 'Nothing of theirs is waiting on a book.' },
        },
        transactions: {
          rows: (detail.recentTransactions ?? []).map(transactionRow),
          empty: 'No deposits or withdrawals yet.',
        },
        reasonDialog,
        roleDialog,
      };
    },
    actions: {
      retry() {
        detail = { status: 'loading' };
        p.changed();
        load();
      },
      startStatusChange() {
        const u = user();
        if (!u || self()) return;
        const freezing = u.status !== 'frozen';
        reasonDialog = {
          freezing,
          title: freezing ? `Freeze ${u.displayName}'s account?` : `Unfreeze ${u.displayName}'s account?`,
          body: freezing ? actionsVm(u).statusNote : 'They can trade, deposit and withdraw again.',
          hint: 'Kept in the audit log with your name.',
          suggestions: freezing ? FREEZE_REASONS : UNFREEZE_REASONS,
          confirmLabel: freezing ? 'Freeze' : 'Unfreeze',
          busyLabel: freezing ? 'Freezing…' : 'Unfreezing…',
          tone: freezing ? 'danger' : 'primary',
          reason: '',
          error: null,
          busy: false,
        };
        p.changed();
      },
      setReason(value) {
        if (!reasonDialog) return;
        reasonDialog = { ...reasonDialog, reason: value, error: null };
        p.changed();
      },
      cancelStatusChange() {
        reasonDialog = null;
        p.changed();
      },
      async confirmStatusChange() {
        if (!reasonDialog || reasonDialog.busy) return;
        const reason = reasonDialog.reason.trim();
        if (!reason) {
          reasonDialog = { ...reasonDialog, error: 'Give a reason for the audit log.' };
          p.changed();
          return;
        }
        const { freezing } = reasonDialog;
        const name = user().displayName;
        const cancelled = openOrders().length;
        reasonDialog = { ...reasonDialog, busy: true };
        p.changed();
        try {
          await adminApi.setUserStatus(id, { status: freezing ? 'frozen' : 'active', reason });
          reasonDialog = null;
          toast(freezing
            ? { title: 'Account frozen', body: cancelled ? `${name}'s ${cancelled} open ${cancelled === 1 ? 'order was' : 'orders were'} cancelled.` : `${name} can still log in and look.`, tone: 'info' }
            : { title: 'Account unfrozen', body: `${name} can trade, deposit and withdraw again.`, tone: 'success' });
          await load();
        } catch (err) {
          if (reasonDialog) reasonDialog = { ...reasonDialog, busy: false, error: err?.details?.reason ? err.message : null };
          if (!err?.details?.reason) errorToast(freezing ? 'The account wasn\'t frozen' : 'The account wasn\'t unfrozen', err);
        }
        p.changed();
      },
      setRole(value) {
        roleChoice = value;
        p.changed();
      },
      askRoleChange() {
        const u = user();
        if (!u || roleChoice === u.role || self() || lastAdmin()) return;
        const promote = roleChoice === 'admin';
        roleDialog = {
          title: promote ? `Make ${u.displayName} an admin?` : `Make ${u.displayName} a user?`,
          body: promote
            ? 'They will be able to review identity checks, approve withdrawals, freeze accounts and halt markets.'
            : 'They lose the admin pages at once.',
          confirmLabel: promote ? 'Make admin' : 'Make user',
          busy: false,
        };
        p.changed();
      },
      cancelRoleChange() {
        roleDialog = null;
        roleChoice = user()?.role ?? roleChoice;
        p.changed();
      },
      async confirmRoleChange() {
        if (!roleDialog || roleDialog.busy) return;
        const name = user().displayName;
        const role = roleChoice;
        roleDialog = { ...roleDialog, busy: true };
        p.changed();
        try {
          await adminApi.setUserRole(id, { role });
          roleDialog = null;
          roleChoice = null;
          toast({ title: 'Role changed', body: `${name} is now ${role === 'admin' ? 'an admin' : 'a user'}.`, tone: 'success' });
          await load();
        } catch (err) {
          roleDialog = null;
          roleChoice = user()?.role ?? roleChoice;
          errorToast('The role wasn\'t changed', err);
        }
        p.changed();
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
