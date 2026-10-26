// useTransactionsPresenter (section 5, TransactionsPage; section 7, Patterns:
// Ledger tab): deposits, withdrawals and the ledger, one tab each (?tab=).
// The ledger shows every entry with the free and locked balance after it and
// its source, filters by asset and by entry group (a comma-separated ?type=,
// an API need from section 7), and says how many of the total are shown.

import * as money from '../../models/domain/money.js';
import * as walletApi from '../../models/api/wallet.api.js';
import { assets, loadAssets, assetByCode } from '../../models/stores/asset.store.js';
import { createPresenter } from '../shared/presenter.js';
import { createCursorList } from '../shared/cursorList.js';
import { navigate } from '../shared/navigation.js';
import { toast, errorToast } from '../shared/toasts.js';
import { amount, signed, shortId, shortAddress } from '../formatters/number.format.js';
import { ledgerTime, listTime } from '../formatters/date.format.js';
import { transactionStatus } from '../formatters/status.format.js';
import { walletAmount } from './deposit.presenter.js';

const TABS = [
  { key: 'deposits', label: 'Deposits' },
  { key: 'withdrawals', label: 'Withdrawals' },
  { key: 'ledger', label: 'Ledger' },
];

/** Entry groups for the ledger filter, as lists of entry types. */
const GROUPS = [
  { value: 'all', label: 'All entries', types: null },
  { value: 'trades', label: 'Trades and fees', types: ['trade_debit', 'trade_credit', 'trade_fee'] },
  { value: 'orders', label: 'Order locks', types: ['order_lock', 'order_unlock'] },
  { value: 'funds', label: 'Deposits and withdrawals', types: ['deposit', 'withdrawal_lock', 'withdrawal_unlock', 'withdrawal', 'withdrawal_fee'] },
  { value: 'credit', label: 'Sign-up credit', types: ['demo_credit'] },
];

const ASSET_ORDER = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB'];
// The board's first page: 13 of the demo trader's 21 entries.
const LEDGER_PAGE = 13;
const LIST_PAGE = 20;

const tabOf = (value) => (TABS.some((t) => t.key === value) ? value : 'ledger');

/** Where an entry came from, with a link to it. */
function source(e) {
  if (e.refType === 'order') return { label: `Order ${shortId(e.refId)}`, href: `/orders?order=${e.refId}` };
  if (e.refType === 'trade') return { label: `Trade ${shortId(e.refId)}`, href: `/orders?tab=trades&trade=${e.refId}` };
  if (e.refType === 'transaction') {
    const deposit = e.type === 'deposit';
    return { label: `${deposit ? 'Deposit' : 'Withdrawal'} ${shortId(e.refId)}`, href: `/wallet/history?tab=${deposit ? 'deposits' : 'withdrawals'}` };
  }
  return { label: 'Sign-up credit', href: null };
}

export function createTransactionsPresenter({ tab: wantedTab, asset: wantedAsset, group: wantedGroup } = {}) {
  const p = createPresenter();
  let tab = tabOf(wantedTab);
  let asset = wantedAsset ? String(wantedAsset).toUpperCase() : 'all';
  let group = GROUPS.some((g) => g.value === wantedGroup) ? wantedGroup : 'all';
  let cancelling = null;

  p.own(assets.subscribe(() => p.changed()));
  loadAssets();

  const lists = {
    deposits: createCursorList(p, ({ cursor, limit }) => walletApi.transactions({ type: 'deposit', cursor, limit }), { limit: LIST_PAGE }),
    withdrawals: createCursorList(p, ({ cursor, limit }) => walletApi.transactions({ type: 'withdrawal', cursor, limit }), { limit: LIST_PAGE }),
    ledger: createCursorList(p, ({ cursor, limit }) => walletApi.ledger({
      asset: asset === 'all' ? undefined : asset,
      types: GROUPS.find((g) => g.value === group)?.types ?? undefined,
      cursor,
      limit,
    }), { limit: LEDGER_PAGE }),
  };

  const open = (key) => {
    if (lists[key].status === 'idle') lists[key].reset();
  };
  open(tab);

  const dp = (code) => assetByCode(code)?.decimals ?? 8;
  // Amounts take their asset's decimals, so a list waits for the assets before it shows
  const shown = (l) => (l.status === 'ready' && !['ready', 'error'].includes(assets.get().status) ? 'loading' : l.status);
  const after = (code, value) => (money.isZero(value) ? '0' : amount(value, dp(code)));

  function ledgerVm() {
    const l = lists.ledger;
    return {
      status: shown(l),
      rows: l.items.map((e) => ({
        key: e.id,
        time: ledgerTime(e.time),
        type: e.type,
        asset: e.asset,
        freeChange: signed(e.deltaAvailable, dp(e.asset), { zero: '—' }),
        lockedChange: signed(e.deltaLocked, dp(e.asset), { zero: '—' }),
        freeAfter: after(e.asset, e.availableAfter),
        lockedAfter: after(e.asset, e.lockedAfter),
        source: source(e),
      })),
      summary: l.total != null ? `Newest first, ${l.items.length} of ${l.total} shown.` : 'Newest first.',
      hasMore: l.hasMore,
      loadingMore: l.loadingMore,
      filters: {
        asset,
        assetOptions: [{ value: 'all', label: 'All assets' }, ...ASSET_ORDER.filter((c) => assetByCode(c)).map((c) => ({ value: c, label: c }))],
        group,
        groupOptions: GROUPS.map((g) => ({ value: g.value, label: g.label })),
      },
      empty: asset === 'all' && group === 'all' ? 'No ledger entries yet.' : 'No entries match these filters.',
    };
  }

  function transactionsVm(key) {
    const l = lists[key];
    const deposits = key === 'deposits';
    return {
      status: shown(l),
      kind: key,
      rows: l.items.map((t) => ({
        key: t.id,
        time: listTime(t.createdAt),
        asset: t.asset,
        amount: `${deposits ? '+' : '−'}${walletAmount(t.asset, t.amount)}`,
        tone: deposits ? 'buy' : 'sell',
        fee: deposits ? null : walletAmount(t.asset, t.fee),
        receive: deposits || !t.receiveAmount ? null : walletAmount(t.asset, t.receiveAmount),
        method: t.method === 'card' ? 'Card' : 'Simulated',
        address: t.address ? shortAddress(t.address) : '—',
        addressFull: t.address,
        hash: t.txHash ? shortAddress(t.txHash) : null,
        hashFull: t.txHash,
        status: transactionStatus(t.status),
        reason: t.status === 'rejected' && t.rejectReason ? t.rejectReason : null,
        canCancel: !deposits && t.status === 'pending',
        cancelling: cancelling === t.id,
      })),
      hasMore: l.hasMore,
      loadingMore: l.loadingMore,
      empty: deposits ? 'No deposits yet. Your 10,000 USDT sign-up credit is on the ledger.' : 'No withdrawals yet.',
    };
  }

  return {
    get vm() {
      return {
        tab,
        tabs: TABS.map((t) => ({ ...t, current: t.key === tab, controls: 'history-panel' })),
        ledger: tab === 'ledger' ? ledgerVm() : null,
        list: tab === 'ledger' ? null : transactionsVm(tab),
      };
    },
    actions: {
      setTab(key) {
        navigate(`/wallet/history?tab=${key}`);
      },
      /** The address bar changed: follow its ?tab=. */
      syncTab(value) {
        const next = tabOf(value);
        if (next === tab) return;
        tab = next;
        open(tab);
        p.changed();
      },
      setAsset(value) {
        asset = value;
        lists.ledger.reset();
      },
      setGroup(value) {
        group = value;
        lists.ledger.reset();
      },
      loadMore() {
        lists[tab].loadMore();
      },
      retry() {
        lists[tab].reset();
      },
      async cancelWithdrawal(id) {
        if (cancelling) return;
        cancelling = id;
        p.changed();
        try {
          const { transaction } = await walletApi.cancelWithdrawal(id);
          toast({ title: 'Withdrawal cancelled', body: `${walletAmount(transaction.asset, transaction.amount)} ${transaction.asset} is free again.`, tone: 'info' });
          lists.withdrawals.reset();
          if (lists.ledger.status !== 'idle') lists.ledger.reset();
        } catch (err) {
          errorToast('The withdrawal wasn\'t cancelled', err);
        } finally {
          cancelling = null;
          p.changed();
        }
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
