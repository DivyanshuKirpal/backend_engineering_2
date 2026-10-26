// useOrdersPresenter (section 5, OrdersPage): the Open, History and Trades
// tabs (?tab=) across every market, filtered by market and side; Cancel per
// order and Cancel all, after a confirmation; and the order drawer (?order=)
// with the order's fill, fee, lifecycle and ledger lines from GET /orders/:id.
// The address bar leads: a link opens the drawer and Close steps back. A
// trade link (?trade=) opens the order that trade filled.

import * as money from '../../models/domain/money.js';
import * as rules from '../../models/domain/order.rules.js';
import * as orderApi from '../../models/api/order.api.js';
import { openOrders, loadOpenOrders, isOpen } from '../../models/stores/order.store.js';
import { tickers, loadMarkets, marketBySymbol } from '../../models/stores/ticker.store.js';
import { assets, loadAssets } from '../../models/stores/asset.store.js';
import { socket } from '../../models/realtime/socket.js';
import { createPresenter } from '../shared/presenter.js';
import { createCursorList } from '../shared/cursorList.js';
import { navigate, back } from '../shared/navigation.js';
import { toast, errorToast } from '../shared/toasts.js';
import { amount, fixed, pair, price as fmtPrice, qty, shortId } from '../formatters/number.format.js';
import { listTime } from '../formatters/date.format.js';
import { orderStatus, cancelReason, sideLabel } from '../formatters/status.format.js';
import { lifecycle, ledgerRows, decimalsOf, remaining, inOrderTerms } from './orderLifecycle.js';

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'history', label: 'History' },
  { key: 'trades', label: 'Trades' },
];
const PAGE = 20;

const tabOf = (value) => (TABS.some((t) => t.key === value) ? value : 'open');
const hrefFor = (tab, extra = {}) => `/orders?${new URLSearchParams({ tab, ...extra })}`;
const usdt = (value) => fixed(value, 2);

export function createOrdersPresenter(query = {}) {
  const p = createPresenter();
  let tab = query.trade && !query.tab ? 'trades' : tabOf(query.tab);
  // An order named without a tab: once it loads, a closed one moves the page to History
  let tabNamed = Boolean(query.tab || query.trade);
  let market = 'all';
  let side = 'all';
  let drawerId = query.order ?? null;
  // True when a link on this page opened the drawer, so Close can step back
  let pushed = false;
  let openedQuietly = null;
  let pendingTrade = query.trade ?? null;
  let litTrade = query.trade ?? null;
  let detail = null;
  let detailFailed = false;
  let detailToken = 0;
  const cancelRequested = new Set();
  let confirming = false;
  let cancellingAll = false;
  let refreshTimer = null;
  let reloadDetail = false;
  const stale = new Set();

  for (const store of [openOrders, tickers, assets]) p.own(store.subscribe(() => p.changed()));
  if (['idle', 'error'].includes(openOrders.get().status)) loadOpenOrders();
  loadMarkets();
  loadAssets();

  const filters = () => ({ market: market === 'all' ? undefined : market, side: side === 'all' ? undefined : side });
  const lists = {
    history: createCursorList(p, ({ cursor, limit }) => orderApi.list({ state: 'history', ...filters(), cursor, limit }), { limit: PAGE }),
    trades: createCursorList(p, ({ cursor, limit }) => orderApi.myTrades({ ...filters(), cursor, limit }), { limit: PAGE }),
  };

  /** Loads a tab's list the first time it shows, and again if it went stale meanwhile. */
  function show(key) {
    const list = lists[key];
    if (!list) return;
    if (list.status === 'idle') list.reset();
    else if (stale.has(key)) list.refresh();
    stale.delete(key);
  }
  show(tab);

  async function loadDetail(id) {
    const mine = ++detailToken;
    try {
      const data = await orderApi.one(id);
      if (mine !== detailToken || p.disposed) return;
      detail = data;
      detailFailed = false;
      if (!tabNamed && !isOpen(data.order)) {
        tabNamed = true;
        navigate(hrefFor('history', { order: id }), { replace: true });
      }
    } catch {
      if (mine !== detailToken || p.disposed) return;
      detailFailed = true;
    }
    p.changed();
  }
  if (drawerId) loadDetail(drawerId);

  // Your orders change as the engine works: refresh what's on screen, mark the rest stale
  function refresh() {
    if (reloadDetail && drawerId) loadDetail(drawerId);
    reloadDetail = false;
    show(tab);
  }
  p.own(socket.on('order.update', ({ order }) => {
    if (!isOpen(order)) cancelRequested.delete(order.id);
    stale.add('history');
    stale.add('trades');
    if (order.id === drawerId) reloadDetail = true;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 250);
  }));
  p.own(socket.on('reconnect', () => {
    stale.add('history');
    stale.add('trades');
    reloadDetail = true;
    refresh();
  }));
  p.own(() => clearTimeout(refreshTimer));

  // A trade link: once the trades are in, open the order that trade filled
  p.own(p.subscribe(() => {
    if (!pendingTrade || lists.trades.status !== 'ready') return;
    const t = lists.trades.items.find((x) => x.id === pendingTrade);
    pendingTrade = null;
    if (t && t.orderId !== drawerId) {
      openedQuietly = t.orderId;
      navigate(hrefFor('trades', { order: t.orderId }), { replace: true });
    }
  }));

  function visibleOpen() {
    return openOrders.get().list
      .filter((o) => (market === 'all' || o.market === market) && (side === 'all' || o.side === side))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  /** The cells an open order and a closed one share. */
  function orderCells(o) {
    const m = marketBySymbol(o.market);
    return {
      key: o.id,
      placed: listTime(o.createdAt),
      id: shortId(o.id),
      href: hrefFor(tab, { order: o.id }),
      market: pair(o.market),
      side: sideLabel(o.side),
      tone: o.side,
      type: o.type,
      price: o.type === 'market' || !m ? 'Market' : fmtPrice(o.price, m.tickSize),
      amount: !m ? '—' : o.quantity ? `${qty(o.quantity, m.stepSize)} ${m.baseAsset}` : inOrderTerms(m, m.quoteAsset, o.quoteQuantity),
      status: orderStatus(o.status),
      current: o.id === drawerId,
    };
  }

  function openVm() {
    const store = openOrders.get();
    if (store.status === 'error') return { status: 'error' };
    if (store.status !== 'ready') return { status: 'loading' };
    const filtered = market !== 'all' || side !== 'all';
    return {
      status: 'ready',
      rows: visibleOpen().map((o) => ({
        ...orderCells(o),
        filled: `${o.quantity && money.isPositive(o.quantity) ? money.pct(o.filledQuantity ?? '0', o.quantity, 0, 'down') : '0'}%`,
        total: o.price && o.quantity ? usdt(money.mul(o.price, o.quantity)) : o.quoteQuantity ? usdt(o.quoteQuantity) : '—',
        cancelling: cancelRequested.has(o.id),
      })),
      empty: filtered
        ? { title: 'No open orders match these filters', body: 'Pick another market or side.' }
        : { title: 'No open orders', body: 'Orders you place on the Trade page wait here until they fill or you cancel them.', action: { label: 'Go to Trade', href: '/trade/BTC-USDT' } },
    };
  }

  function historyVm() {
    const l = lists.history;
    return {
      status: l.status,
      rows: l.items.map((o) => {
        const m = marketBySymbol(o.market);
        return {
          ...orderCells(o),
          filled: m ? `${qty(o.filledQuantity ?? '0', m.stepSize)} ${m.baseAsset}` : '—',
          avg: o.avgPrice && m ? fmtPrice(o.avgPrice, m.tickSize) : '—',
          total: o.executedQuote && money.isPositive(o.executedQuote) ? usdt(o.executedQuote) : '—',
          reason: o.status === 'cancelled' ? cancelReason(o.cancelReason) : o.status === 'rejected' ? o.rejectReason : null,
          closed: listTime(o.updatedAt),
        };
      }),
      hasMore: l.hasMore,
      loadingMore: l.loadingMore,
      empty: market !== 'all' || side !== 'all'
        ? { title: 'No closed orders match these filters', body: 'Pick another market or side.' }
        : { title: 'No closed orders yet', body: 'Orders move here once they fill or are cancelled.' },
    };
  }

  function tradesVm() {
    const l = lists.trades;
    return {
      status: l.status,
      rows: l.items.map((t) => {
        const m = marketBySymbol(t.market);
        return {
          key: t.id,
          time: listTime(t.time),
          order: shortId(t.orderId),
          href: hrefFor('trades', { order: t.orderId }),
          market: pair(t.market),
          side: sideLabel(t.side),
          tone: t.side,
          role: t.role === 'maker' ? 'Maker' : 'Taker',
          price: m ? fmtPrice(t.price, m.tickSize) : t.price,
          amount: m ? `${qty(t.quantity, m.stepSize)} ${m.baseAsset}` : t.quantity,
          total: usdt(t.quoteQuantity),
          fee: `${amount(t.fee, decimalsOf(t.feeAsset))} ${t.feeAsset}`,
          current: t.id === litTrade,
        };
      }),
      hasMore: l.hasMore,
      loadingMore: l.loadingMore,
      empty: market !== 'all' || side !== 'all'
        ? { title: 'No trades match these filters', body: 'Pick another market or side.' }
        : { title: 'No trades yet', body: 'Each fill of your orders shows here, as maker or taker.' },
    };
  }

  function cancelVm(o, m) {
    const requested = cancelRequested.has(o.id);
    const held = o.status === 'pending' ? rules.lockFor(m, o) : rules.stillLocked(m, o);
    const holds = inOrderTerms(m, held.asset, held.amount);
    const left = `${qty(remaining(o), m.stepSize)} ${m.baseAsset}`;
    let note;
    if (requested) note = 'The engine takes it off the book in a moment.';
    else if (o.status === 'pending') note = `The cancel waits for the engine to queue the order, then unlocks the ${holds} it holds.`;
    else if (o.status === 'partially_filled') {
      note = o.side === 'sell'
        ? `Cancelling unlocks the ${left} that hasn't filled. The filled part stays filled.`
        : `Cancelling unlocks the ${holds} held for the ${left} that hasn't filled. The filled part stays filled.`;
    } else note = `Cancelling unlocks the ${holds} it holds.`;
    return {
      label: requested ? 'Cancelling…' : o.status === 'partially_filled' && o.type === 'limit' ? `Cancel the remaining ${left}` : 'Cancel this order',
      note,
      busy: requested,
    };
  }

  function drawerVm() {
    if (!drawerId) return null;
    const o = detail?.order?.id === drawerId ? detail.order : null;
    const m = o ? marketBySymbol(o.market) : null;
    if (!o || !m) return { status: detailFailed ? 'error' : 'loading', key: drawerId, id: shortId(drawerId) };

    const base = m.baseAsset;
    const quote = m.quoteAsset;
    const open = isOpen(o);
    const marketBuy = o.type === 'market' && o.side === 'buy';
    const fills = detail.fills;

    const headline = o.type === 'limit'
      ? `${qty(o.quantity, m.stepSize)} ${base} at ${fmtPrice(o.price, m.tickSize)}`
      : marketBuy ? `${usdt(o.quoteQuantity)} ${quote} of ${base} at market` : `${qty(o.quantity, m.stepSize)} ${base} at market`;
    const done = marketBuy ? o.executedQuote ?? '0' : o.filledQuantity ?? '0';
    const of = marketBuy ? o.quoteQuantity : o.quantity;
    const progress = {
      value: of && money.isPositive(of) ? Number(money.pct(done, of, 1, 'down')) : 0,
      label: marketBuy ? `${usdt(done)} of ${usdt(of)} ${quote} spent` : `${qty(done, m.stepSize)} of ${qty(of, m.stepSize)} filled`,
    };

    // What came in, net of the fee, and the fee itself
    const feeAsset = o.feeAsset ?? (o.side === 'buy' ? base : quote);
    const fee = o.fee ?? '0';
    const gotAsset = o.side === 'sell' ? quote : base;
    const gross = o.side === 'sell' ? o.executedQuote ?? '0' : o.filledQuantity ?? '0';
    const got = feeAsset === gotAsset ? money.sub(gross, fee) : gross;
    const roles = [...new Set(fills.map((f) => f.role))].join(' and ');
    const held = open ? (o.status === 'pending' ? rules.lockFor(m, o) : rules.stillLocked(m, o)) : null;

    return {
      status: 'ready',
      key: o.id,
      id: shortId(o.id),
      kind: { label: `${sideLabel(o.side)} ${o.type}`, tone: o.side },
      context: ` · ${pair(o.market)} · ${o.timeInForce === 'GTC' ? 'good till cancelled' : 'immediate or cancel'}`,
      headline,
      progress,
      facts: [
        { key: 'avg', label: 'Average fill', value: o.avgPrice ? fmtPrice(o.avgPrice, m.tickSize) : '—' },
        { key: 'got', label: open ? 'Received so far' : 'Received', value: money.isPositive(got) ? `${amount(got, decimalsOf(gotAsset))} ${gotAsset}` : '—' },
        { key: 'fee', label: 'Fee paid', value: fills.length ? `${amount(fee, decimalsOf(feeAsset))} ${feeAsset} · ${roles}` : '—' },
        held
          ? { key: 'held', label: 'Still locked', value: `${amount(held.amount, decimalsOf(held.asset))} ${held.asset}` }
          : { key: 'closed', label: orderStatus(o.status).label, value: listTime(o.updatedAt) },
      ],
      clientOrderId: o.clientOrderId,
      timeline: lifecycle(o, fills, detail.ledger, { short: true }),
      ledger: ledgerRows(detail.ledger, { zero: '—' }),
      cancel: open ? cancelVm(o, m) : null,
    };
  }

  function confirmVm() {
    const n = visibleOpen().length;
    const what = [market !== 'all' ? pair(market) : null, side !== 'all' ? side : null].filter(Boolean).join(' ');
    const orders = `open ${what ? `${what} ` : ''}order${n === 1 ? '' : 's'}`;
    return {
      title: n === 1 ? `Cancel your ${orders}?` : `Cancel all ${n} ${orders}?`,
      body: n === 1
        ? 'The engine takes it off the book and unlocks what it holds. Anything already filled stays filled.'
        : 'The engine takes them off the book and unlocks what they hold. Anything already filled stays filled.',
      confirmLabel: n === 1 ? 'Cancel it' : 'Cancel them',
      cancelLabel: n === 1 ? 'Keep it' : 'Keep them',
      busy: cancellingAll,
    };
  }

  const resetLists = () => {
    for (const key of Object.keys(lists)) {
      if (lists[key].status === 'idle') continue;
      if (key === tab) lists[key].reset();
      else stale.add(key);
    }
  };

  return {
    get vm() {
      const store = openOrders.get();
      return {
        tab,
        tabs: TABS.map((t) => ({
          ...t,
          count: t.key === 'open' && store.status === 'ready' ? store.list.length : null,
          current: t.key === tab,
          controls: 'orders-panel',
        })),
        filters: {
          market,
          marketOptions: [{ value: 'all', label: 'All' }, ...tickers.get().markets.map((x) => ({ value: x.symbol, label: pair(x.symbol) }))],
          side,
          sideOptions: [{ value: 'all', label: 'Both sides' }, { value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }],
        },
        cancelAll: tab === 'open' ? { disabled: store.status !== 'ready' || visibleOpen().length === 0 || cancellingAll } : null,
        open: tab === 'open' ? openVm() : null,
        history: tab === 'history' ? historyVm() : null,
        trades: tab === 'trades' ? tradesVm() : null,
        drawer: drawerVm(),
        confirm: confirming ? confirmVm() : null,
      };
    },
    actions: {
      setTab(key) {
        if (key !== tab) navigate(hrefFor(key));
      },
      /** The address bar changed (a link, Back, Forward): follow ?tab=, ?order= and ?trade=. */
      sync(q) {
        tab = q.trade && !q.tab ? 'trades' : tabOf(q.tab);
        tabNamed = Boolean(q.tab || q.trade);
        if (q.trade) {
          litTrade = q.trade;
          pendingTrade = q.trade;
        }
        show(tab);
        const nextOrder = q.order ?? null;
        if (nextOrder !== drawerId) {
          pushed = Boolean(nextOrder) && nextOrder !== openedQuietly;
          drawerId = nextOrder;
          detail = null;
          detailFailed = false;
          if (drawerId) loadDetail(drawerId);
        }
        openedQuietly = null;
        p.changed();
      },
      setMarket(value) {
        market = value;
        resetLists();
        p.changed();
      },
      setSide(value) {
        side = value;
        resetLists();
        p.changed();
      },
      closeDrawer() {
        if (pushed) back();
        else navigate(hrefFor(tab), { replace: true });
      },
      retryDrawer() {
        detailFailed = false;
        p.changed();
        loadDetail(drawerId);
      },
      loadMore() {
        lists[tab]?.loadMore();
      },
      retry() {
        if (tab === 'open') loadOpenOrders();
        else lists[tab].reset();
      },
      async cancel(id) {
        if (cancelRequested.has(id)) return;
        cancelRequested.add(id);
        p.changed();
        try {
          await orderApi.cancel(id);
          toast({ title: 'Cancel requested', body: 'The engine takes it off the book in a moment.', tone: 'info' });
        } catch (err) {
          cancelRequested.delete(id);
          errorToast('The order wasn\'t cancelled', err);
          p.changed();
        }
      },
      askCancelAll() {
        confirming = true;
        p.changed();
      },
      dismissCancelAll() {
        confirming = false;
        p.changed();
      },
      async confirmCancelAll() {
        if (cancellingAll) return;
        const ids = visibleOpen().map((o) => o.id);
        cancellingAll = true;
        p.changed();
        try {
          // Cancel all takes a market; with a side picked, the shown orders go one by one
          if (side === 'all') await orderApi.cancelAll({ market: market === 'all' ? undefined : market });
          else await Promise.all(ids.map((id) => orderApi.cancel(id)));
          ids.forEach((id) => cancelRequested.add(id));
          confirming = false;
          toast({ title: 'Cancel requested', body: `The engine takes ${ids.length === 1 ? 'the order' : `all ${ids.length} orders`} off the book in a moment.`, tone: 'info' });
        } catch (err) {
          errorToast('The orders weren\'t cancelled', err);
        } finally {
          cancellingAll = false;
          p.changed();
        }
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
