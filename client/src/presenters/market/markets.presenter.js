// useMarketsPresenter (section 5, MarketsPage): every pair with its live
// ticker, tabs for All, Watchlist, Gainers and Losers, search by name or code,
// sortable columns, and the watchlist star.

import * as money from '../../models/domain/money.js';
import * as userApi from '../../models/api/user.api.js';
import { tickers, loadMarkets } from '../../models/stores/ticker.store.js';
import { assets, loadAssets } from '../../models/stores/asset.store.js';
import { session } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { toast, errorToast } from '../shared/toasts.js';
import { navigate } from '../shared/navigation.js';
import { price as fmtPrice, change, millions, significant, pair } from '../formatters/number.format.js';
import { marketStatus } from '../formatters/status.format.js';
import { tile, assetName } from '../formatters/asset.format.js';

const TABS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'watchlist', label: 'Watchlist', test: (m, starred) => starred.has(m.symbol) },
  { key: 'gainers', label: 'Gainers', test: (m) => money.isPositive(m.ticker.changePct) },
  { key: 'losers', label: 'Losers', test: (m) => money.isNegative(m.ticker.changePct) },
];

const SORTS = {
  last: (m) => m.ticker.last,
  change: (m) => m.ticker.changePct,
  high: (m) => m.ticker.high,
  low: (m) => m.ticker.low,
  volume: (m) => m.ticker.quoteVolume,
};

export function createMarketsPresenter() {
  const p = createPresenter();
  let tab = 'all';
  let query = '';
  let sort = null; // { key, dir: 'asc' | 'desc' }
  let starred = new Set();
  let busy = new Set();

  for (const store of [tickers, assets]) p.own(store.subscribe(() => p.changed()));
  p.own(session.subscribe(() => {
    loadWatchlist();
    p.changed();
  }));
  loadMarkets();
  loadAssets();

  async function loadWatchlist() {
    if (session.get().status !== 'user') {
      starred = new Set();
      return;
    }
    try {
      const { watchlist } = await userApi.watchlist();
      starred = new Set(watchlist);
      p.changed();
    } catch {
      // The stars just stay empty; the table still works.
    }
  }
  loadWatchlist();

  const actions = {
    setTab(key) {
      tab = key;
      p.changed();
    },
    setQuery(text) {
      query = text;
      p.changed();
    },
    sortBy(key) {
      sort = sort?.key !== key ? { key, dir: 'desc' } : sort.dir === 'desc' ? { key, dir: 'asc' } : null;
      p.changed();
    },
    async toggleStar(symbol) {
      if (session.get().status !== 'user') {
        toast({ title: 'Log in to keep a watchlist', body: 'Starred markets stay on your account.' });
        navigate(`/login?next=${encodeURIComponent('/markets')}`);
        return;
      }
      if (busy.has(symbol)) return;
      busy.add(symbol);
      const had = starred.has(symbol);
      // Change the star at once; put it back if the request fails.
      if (had) starred.delete(symbol);
      else starred.add(symbol);
      p.changed();
      try {
        const { watchlist } = had ? await userApi.unstar(symbol) : await userApi.star(symbol);
        starred = new Set(watchlist);
      } catch (err) {
        if (had) starred.add(symbol);
        else starred.delete(symbol);
        errorToast('The watchlist didn\'t change', err);
      } finally {
        busy.delete(symbol);
        p.changed();
      }
    },
    retry: () => loadMarkets(),
  };

  function vm() {
    const t = tickers.get();
    const list = assets.get().list;
    const signedIn = session.get().status === 'user';
    const q = query.trim().toLowerCase();
    const current = TABS.find((x) => x.key === tab);
    let rows = t.markets.filter((m) => current.test(m, starred)).filter((m) => {
      if (!q) return true;
      const name = assetName(m.baseAsset, list).toLowerCase();
      return m.symbol.toLowerCase().includes(q.replace('/', '-')) || name.includes(q) || m.baseAsset.toLowerCase().startsWith(q);
    });
    if (sort) {
      const get = SORTS[sort.key];
      rows = [...rows].sort((a, b) => money.cmp(get(a), get(b)) * (sort.dir === 'asc' ? 1 : -1));
    }
    const halted = t.markets.filter((m) => m.status === 'halted');

    let empty = null;
    if (t.status === 'ready' && rows.length === 0) {
      if (q) empty = { title: 'No markets match that', body: `Nothing is called "${query.trim()}". Try a code such as BTC, or a name such as Solana.` };
      else if (tab === 'watchlist') {
        empty = signedIn
          ? { title: 'No markets on your watchlist', body: 'Star a market in the All tab to keep it here.' }
          : { title: 'Your watchlist lives on your account', body: 'Log in, then star the markets you follow.', action: { label: 'Log in', href: '/login?next=%2Fmarkets' } };
      } else empty = { title: tab === 'gainers' ? 'Nothing is up on the day' : 'Nothing is down on the day', body: 'Changes are over the last 24 hours.' };
    }

    return {
      status: t.status,
      error: t.error?.message ?? null,
      tabs: TABS.map((x) => ({ key: x.key, label: x.label, count: t.markets.filter((m) => x.test(m, starred)).length, current: x.key === tab })),
      query,
      sort: Object.fromEntries(Object.keys(SORTS).map((k) => [k, sort?.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'])),
      rows: rows.map((m) => {
        const status = marketStatus(m.status);
        return {
          key: m.symbol,
          symbol: m.symbol,
          href: `/trade/${m.symbol}`,
          tile: tile(m.baseAsset),
          pair: pair(m.symbol),
          name: assetName(m.baseAsset, list),
          last: fmtPrice(m.ticker.last, m.tickSize),
          change: change(m.ticker.changePct),
          high: fmtPrice(m.ticker.high, m.tickSize),
          low: fmtPrice(m.ticker.low, m.tickSize),
          quoteVolume: `${millions(m.ticker.quoteVolume)} ${m.quoteAsset}`,
          baseVolume: `${significant(m.ticker.volume)} ${m.baseAsset}`,
          status,
          halted: m.status === 'halted',
          action: m.status === 'halted' ? 'View' : 'Trade',
          starred: starred.has(m.symbol),
          starLabel: starred.has(m.symbol) ? `Remove ${pair(m.symbol)} from your watchlist` : `Add ${pair(m.symbol)} to your watchlist`,
        };
      }),
      empty,
      footnote: halted.length
        ? `${halted.map((m) => pair(m.symbol)).join(' and ')} ${halted.length > 1 ? 'are' : 'is'} halted: new orders are paused, and you can still cancel open ones.`
        : null,
    };
  }

  return { get vm() { return vm(); }, actions, subscribe: p.subscribe, dispose: p.dispose };
}
