// useMyOrdersPresenter (section 5, MyOrdersPanel; section 7, Order lifecycle
// and Order ledger): your open orders as a strip of buttons, this market's
// first; the picked one's lifecycle from GET /orders/:id with the ledger
// entries it wrote; and cancelling it. The pick stays on an order after it
// fills or is cancelled, so its last step stays in view.

import * as money from '../../models/domain/money.js';
import * as rules from '../../models/domain/order.rules.js';
import * as orderApi from '../../models/api/order.api.js';
import { openOrders, loadOpenOrders } from '../../models/stores/order.store.js';
import { marketBySymbol } from '../../models/stores/ticker.store.js';
import { assetByCode } from '../../models/stores/asset.store.js';
import { socket } from '../../models/realtime/socket.js';
import { fixed, plain, price as fmtPrice, qty, signed } from '../formatters/number.format.js';
import { precise } from '../formatters/date.format.js';
import { cancelReason, orderStatus } from '../formatters/status.format.js';
import { toast, errorToast } from '../shared/toasts.js';

const decimalsOf = (asset) => assetByCode(asset)?.decimals ?? 8;
const remaining = (o) => money.sub(o.quantity ?? '0', o.filledQuantity ?? '0');

/** An amount in the order's own terms: the base at the step (0.02500 BTC), the quote at the tick when it fits. */
function inOrderTerms(m, asset, value) {
  if (asset === m.baseAsset) return `${qty(value, m.stepSize)} ${asset}`;
  const dp = money.decimalsOf(m.tickSize);
  return `${money.eq(money.round(value, dp), value) ? fixed(value, dp) : plain(value)} ${asset}`;
}

export function createMyOrdersPresenter(p, { symbol, signedIn }) {
  let picked = null;
  let detail = null;
  let detailFailed = false;
  let cancelling = false;
  let token = 0;
  let reloadTimer = null;

  /** This market's orders first, each group oldest first (the board's order). */
  function sorted() {
    const list = [...openOrders.get().list];
    const time = (o) => Date.parse(o.createdAt);
    return [
      ...list.filter((o) => o.market === symbol).sort((a, b) => time(a) - time(b)),
      ...list.filter((o) => o.market !== symbol).sort((a, b) => time(a) - time(b)),
    ];
  }

  async function loadDetail(id) {
    const mine = ++token;
    try {
      const data = await orderApi.one(id);
      if (mine !== token || p.disposed) return;
      detail = data;
      detailFailed = false;
    } catch {
      if (mine !== token || p.disposed) return;
      detailFailed = true;
    }
    p.changed();
  }

  function pick(id) {
    if (!id || id === picked) return;
    picked = id;
    detail = null;
    detailFailed = false;
    loadDetail(id);
    p.changed();
  }

  /** Called on every store change: load the list when needed and keep a pick. */
  function sync() {
    if (!signedIn()) {
      picked = null;
      detail = null;
      return;
    }
    if (openOrders.get().status === 'idle') loadOpenOrders();
    if (!picked && openOrders.get().status === 'ready') {
      const first = sorted()[0];
      if (first) pick(first.id);
    }
  }

  p.own(openOrders.subscribe(() => {
    sync();
    p.changed();
  }));
  // A fill or a cancel on the picked order: read its lifecycle and ledger again.
  p.own(socket.on('order.update', ({ order }) => {
    if (order.id !== picked) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => loadDetail(order.id), 150);
  }));
  p.own(socket.on('reconnect', () => picked && loadDetail(picked)));
  p.own(() => clearTimeout(reloadTimer));
  sync();

  function stripLabel(o) {
    const m = marketBySymbol(o.market);
    const sideWord = o.side === 'buy' ? 'Buy' : 'Sell';
    const what = o.type === 'market'
      ? 'at market'
      : `${plain(o.quantity)} @ ${plain(o.price)}`;
    const head = o.market === symbol ? `${sideWord} ${what}` : `${m?.baseAsset ?? o.market.split('-')[0]} ${sideWord.toLowerCase()} ${what}`;
    if (o.status === 'pending') return `${head} · pending`;
    if (o.status === 'partially_filled' && o.quantity) return `${head} · ${money.pct(o.filledQuantity, o.quantity, 0, 'down')}%`;
    return head;
  }

  function timeline(o, fills, ledger) {
    const m = marketBySymbol(o.market);
    if (!m) return [];
    const base = m.baseAsset;
    const at = (v) => fmtPrice(v, m.tickSize);
    const items = [];

    const lockEntry = ledger.find((e) => e.type === 'order_lock');
    const lock = lockEntry
      ? { asset: lockEntry.asset, amount: lockEntry.deltaLocked }
      : rules.lockFor(m, o);
    items.push({
      key: 'placed', time: precise(o.createdAt), title: 'Placed.', state: 'done',
      body: `The API accepted it (202) and locked ${inOrderTerms(m, lock.asset, lock.amount)}.`,
    });

    if (o.status === 'rejected') {
      items.push({ key: 'rejected', time: precise(o.updatedAt), title: 'Rejected.', state: 'stopped', body: `${o.rejectReason ?? 'The engine turned it down'}. The lock went back to free.` });
      return items;
    }
    if (!o.appliedAt) {
      items.push({ key: 'now', time: 'now', title: 'Waiting for the engine.', state: 'now', body: 'It goes on the book, or fills, in a moment.' });
      return items;
    }

    const takenOnArrival = fills.filter((f) => f.role === 'taker');
    if (o.type === 'market') {
      items.push({ key: 'applied', time: precise(o.appliedAt), title: 'Matched.', state: 'done', body: 'The engine ran it against the book straight away.' });
    } else if (takenOnArrival.length && !money.isPositive(remaining(o)) && o.status === 'filled' && takenOnArrival.length === fills.length) {
      items.push({ key: 'applied', time: precise(o.appliedAt), title: 'Matched on arrival.', state: 'done', body: 'It crossed the book, so it never rested.' });
    } else if (takenOnArrival.length) {
      items.push({ key: 'applied', time: precise(o.appliedAt), title: 'On the book.', state: 'done', body: `The engine matched part of it on arrival and queued the rest at ${at(o.price)}.` });
    } else {
      items.push({ key: 'applied', time: precise(o.appliedAt), title: 'On the book.', state: 'done', body: `The engine queued it at ${at(o.price)}.` });
    }

    let done = '0';
    fills.forEach((f, i) => {
      done = money.add(done, f.quantity);
      const complete = o.status === 'filled' && i === fills.length - 1;
      items.push({
        key: f.id, time: precise(f.time), title: complete ? 'Filled.' : 'Partly filled.', state: complete ? 'done' : 'part',
        body: `${qty(f.quantity, m.stepSize)} ${base} at ${at(f.price)}. You were the ${f.role}.`,
      });
    });

    if (o.status === 'open' || o.status === 'partially_filled') {
      items.push({ key: 'now', time: 'now', title: 'Waiting.', state: 'now', body: `${qty(remaining(o), m.stepSize)} ${base} left at ${at(o.price)}.` });
    } else if (o.status === 'cancelled') {
      const unlock = ledger.filter((e) => e.type === 'order_unlock').at(-1);
      const back = unlock ? ` ${inOrderTerms(m, unlock.asset, unlock.deltaAvailable)} went back to free.` : '';
      items.push({ key: 'cancelled', time: precise(o.updatedAt), title: 'Cancelled.', state: 'stopped', body: `${cancelReason(o.cancelReason)}.${back}` });
    }
    return items;
  }

  return {
    vm() {
      if (!signedIn()) return { status: 'guest', next: `/trade/${symbol}` };
      const store = openOrders.get();
      if (store.status === 'error') return { status: 'error' };
      if (store.status !== 'ready') return { status: 'loading' };

      const list = sorted();
      const here = list.filter((o) => o.market === symbol);
      const pickedOpen = list.some((o) => o.id === picked);
      const o = detail?.order?.id === picked ? detail.order : null;
      return {
        status: 'ready',
        count: `${list.length} open`,
        strip: list.map((x) => ({ key: x.id, label: stripLabel(x), current: x.id === picked })),
        // The phone's short list: this market's first two
        rows: here.slice(0, 2).map((x) => {
          const m = marketBySymbol(x.market);
          const st = orderStatus(x.status);
          return {
            key: x.id,
            side: x.side === 'buy' ? 'Buy' : 'Sell',
            tone: x.side,
            text: m ? `${qty(x.quantity, m.stepSize)} @ ${fmtPrice(x.price, m.tickSize)}` : '',
            status: x.status === 'partially_filled' ? `${money.pct(x.filledQuantity, x.quantity, 0, 'down')}% filled` : st.label,
            statusTone: x.status === 'partially_filled' ? 'wait' : 'muted',
          };
        }),
        empty: list.length ? null : 'No open orders. Place one with the ticket, and its lifecycle shows here.',
        picked: picked
          ? {
            status: o ? 'ready' : detailFailed ? 'error' : 'loading',
            title: o ? stripLabel(o) : '',
            canCancel: pickedOpen,
            cancelling,
            timeline: o ? timeline(o, detail.fills, detail.ledger) : [],
            ledger: o
              ? detail.ledger.map((e) => ({
                key: e.id,
                type: e.type,
                asset: e.asset,
                available: signed(e.deltaAvailable, decimalsOf(e.asset)),
                locked: signed(e.deltaLocked, decimalsOf(e.asset)),
              }))
              : [],
          }
          : null,
      };
    },
    actions: {
      pick,
      retry() {
        if (openOrders.get().status === 'error') loadOpenOrders();
        if (picked) loadDetail(picked);
      },
      async cancel() {
        if (!picked || cancelling) return;
        cancelling = true;
        p.changed();
        try {
          await orderApi.cancel(picked);
          toast({ title: 'Cancel requested', body: 'The engine takes it off the book in a moment.', tone: 'info' });
        } catch (err) {
          errorToast('The order wasn\'t cancelled', err);
        } finally {
          cancelling = false;
          p.changed();
        }
      },
    },
  };
}
