// useMyOrdersPresenter (section 5, MyOrdersPanel; section 7, Order lifecycle
// and Order ledger): your open orders as a strip of buttons, this market's
// first; the picked one's lifecycle from GET /orders/:id with the ledger
// entries it wrote; and cancelling it. The pick stays on an order after it
// fills or is cancelled, so its last step stays in view.

import * as money from '../../models/domain/money.js';
import * as orderApi from '../../models/api/order.api.js';
import { openOrders, loadOpenOrders } from '../../models/stores/order.store.js';
import { marketBySymbol } from '../../models/stores/ticker.store.js';
import { socket } from '../../models/realtime/socket.js';
import { plain, price as fmtPrice, qty } from '../formatters/number.format.js';
import { orderStatus } from '../formatters/status.format.js';
import { toast, errorToast } from '../shared/toasts.js';
import { lifecycle, ledgerRows } from '../orders/orderLifecycle.js';

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
            timeline: o ? lifecycle(o, detail.fills, detail.ledger) : [],
            ledger: o ? ledgerRows(detail.ledger) : [],
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
