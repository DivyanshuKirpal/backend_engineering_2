// useTradePresenter (section 5, TradePage): composes the market header,
// chart, order book, tape, order ticket and your orders for one market. It
// hands ladder price clicks and the live book to the ticket (section 6, flow
// C, step 5), and holds the page's own state: the phone's Chart, Book and
// Trades tabs and the ticket sheet. An unknown symbol shows a not-found state.

import * as money from '../../models/domain/money.js';
import { tickers, loadMarkets, marketBySymbol } from '../../models/stores/ticker.store.js';
import { assets, loadAssets } from '../../models/stores/asset.store.js';
import { balances, loadBalances, freeByAsset } from '../../models/stores/balance.store.js';
import { openOrders } from '../../models/stores/order.store.js';
import { session } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { rememberMarket } from '../shared/lastMarket.js';
import { fixed, pair, qty } from '../formatters/number.format.js';
import { createMarketHeaderPresenter } from './marketHeader.presenter.js';
import { createChartPresenter } from './chart.presenter.js';
import { createOrderBookPresenter } from './orderBook.presenter.js';
import { createRecentTradesPresenter } from './recentTrades.presenter.js';
import { createOrderFormPresenter } from './orderForm.presenter.js';
import { createMyOrdersPresenter } from './myOrders.presenter.js';

const TABS = [
  { key: 'chart', label: 'Chart' },
  { key: 'book', label: 'Book' },
  { key: 'trades', label: 'Trades' },
];

export const tradeTitle = (symbol) => `${pair(String(symbol ?? '').toUpperCase())} · Trade`;

export function createTradePresenter(rawSymbol) {
  const symbol = String(rawSymbol ?? '').toUpperCase();
  const p = createPresenter();
  let tab = 'chart';
  let sheet = false;

  const market = () => marketBySymbol(symbol);
  const signedIn = () => session.get().status === 'user';

  function sync() {
    if (market()) rememberMarket(symbol);
    if (signedIn() && balances.get().status === 'idle') loadBalances();
  }

  for (const store of [tickers, assets, session, balances]) {
    p.own(store.subscribe(() => {
      sync();
      p.changed();
    }));
  }
  loadMarkets();
  loadAssets();
  sync();

  const header = createMarketHeaderPresenter(p, { symbol, market });
  const chart = createChartPresenter(p, { symbol, market });
  const trades = createRecentTradesPresenter(p, { symbol, market });
  const myOrders = createMyOrdersPresenter(p, { symbol, signedIn });
  let form = null;
  const book = createOrderBookPresenter(p, {
    symbol,
    market,
    mine: () => (signedIn() ? openOrders.get().list.filter((o) => o.market === symbol) : []),
    lastUp: () => trades.lastUp() ?? !money.isNegative(market()?.ticker.changePct ?? '0'),
    onPick: (price) => form.actions.usePrice(price),
  });
  form = createOrderFormPresenter(p, {
    symbol,
    market,
    levels: book.levels,
    onPlaced(order) {
      myOrders.actions.pick(order.id);
      sheet = false;
      p.changed();
    },
  });

  function vm() {
    const m = market();
    if (!m) {
      const status = tickers.get().status;
      if (status === 'error') return { status: 'error' };
      if (status === 'ready') return { status: 'missing', pair: pair(symbol) };
      return { status: 'loading' };
    }
    const free = freeByAsset();
    const formVm = form.vm();
    return {
      status: 'ready',
      symbol,
      base: m.baseAsset,
      signedIn: signedIn(),
      banner: m.status === 'halted' ? { pair: pair(symbol) } : null,
      header: header.vm(),
      chart: chart.vm(),
      book: book.vm(),
      trades: trades.vm(),
      form: formVm,
      myOrders: myOrders.vm(),
      tabs: TABS.map((t) => ({ ...t, current: t.key === tab, controls: `trade-${t.key}` })),
      tab,
      sheet: {
        open: sheet,
        title: formVm.status === 'ready' ? `${formVm.side === 'buy' ? 'Buy' : 'Sell'} ${m.baseAsset}` : `Trade ${pair(symbol)}`,
      },
      // The phone's bottom bar: Free to trade 1,616.00 USDT · 0.03744 BTC
      freeToTrade: signedIn() && balances.get().status === 'ready'
        ? `${fixed(free[m.quoteAsset] ?? '0', money.decimalsOf(m.tickSize))} ${m.quoteAsset} · ${qty(free[m.baseAsset] ?? '0', m.stepSize)} ${m.baseAsset}`
        : null,
      halted: m.status === 'halted',
    };
  }

  const actions = {
    header: header.actions,
    chart: chart.actions,
    book: book.actions,
    trades: trades.actions,
    form: form.actions,
    myOrders: myOrders.actions,
    setTab(key) {
      if (key === tab) return;
      tab = key;
      p.changed();
    },
    /** The phone's Buy and Sell buttons open the ticket on that side. */
    openTicket(side) {
      if (side) form.actions.setSide(side);
      sheet = true;
      p.changed();
    },
    closeTicket() {
      if (!sheet) return;
      sheet = false;
      p.changed();
    },
    retry() {
      loadMarkets();
      chart.actions.retry();
      book.actions.retry();
      trades.actions.retry();
      myOrders.actions.retry();
    },
  };

  return { get vm() { return vm(); }, actions, subscribe: p.subscribe, dispose: p.dispose };
}
