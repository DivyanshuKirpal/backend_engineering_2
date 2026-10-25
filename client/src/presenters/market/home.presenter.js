// useHomePresenter (section 5, HomePage): the hero's live BTC/USDT ladder with
// a sample order on it, the ticker strip, and the gainers, losers and most
// traded cards, all from the tickers store and the live book.

import * as money from '../../models/domain/money.js';
import { tickers, loadMarkets } from '../../models/stores/ticker.store.js';
import { assets, loadAssets } from '../../models/stores/asset.store.js';
import { session } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { createLiveBook } from '../shared/liveBook.js';
import { ladder } from '../trade/ladder.js';
import { price as fmtPrice, change, millions, pair, signed } from '../formatters/number.format.js';
import { precise } from '../formatters/date.format.js';
import { tile, assetName } from '../formatters/asset.format.js';

const HERO = 'BTC-USDT';
const SAMPLE_QTY = '0.02';

export function createHomePresenter() {
  const p = createPresenter();
  const placedAt = new Date();
  const appliedAt = new Date(placedAt.getTime() + 87);

  for (const store of [tickers, assets, session]) p.own(store.subscribe(() => p.changed()));
  loadMarkets();
  loadAssets();
  const book = createLiveBook(HERO, () => p.changed(), { depth: 20 });
  p.own(book.dispose);

  function heroVm(markets) {
    const m = markets.find((x) => x.symbol === HERO);
    if (!m || book.status !== 'ready') return { status: book.status === 'error' ? 'error' : 'loading' };
    const asks = book.side('asks', 6);
    let bids = book.side('bids', 6);
    // The sample order stays the new best bid, first in its queue, as the book
    // moves: at the last price when that sits inside the spread, otherwise one
    // tick above the best bid. It never crosses the asks.
    let samplePrice = null;
    if (asks.length && bids.length) {
      const last = m.ticker.last;
      const [bestBid] = bids[0];
      const [bestAsk] = asks[0];
      const candidate = money.gt(last, bestBid) && money.lt(last, bestAsk) ? last : money.add(bestBid, m.tickSize);
      if (money.lt(candidate, bestAsk)) samplePrice = candidate;
    }
    if (samplePrice) {
      bids = [...bids.filter(([pr]) => !money.eq(pr, samplePrice)), [samplePrice, SAMPLE_QTY]]
        .sort((a, b) => money.cmp(b[0], a[0]));
    }
    const rows = ladder({
      asks, bids, tickSize: m.tickSize, stepSize: m.stepSize, depth: 5,
      mine: samplePrice ? [{ side: 'buy', price: samplePrice, quantity: SAMPLE_QTY }] : [],
      last: m.ticker.last,
      lastUp: !money.isNegative(m.ticker.changePct),
    });
    const lock = samplePrice ? money.mul(samplePrice, SAMPLE_QTY) : '0';
    return {
      status: 'ready',
      title: `${pair(HERO)} · Price ladder`,
      change: change(m.ticker.changePct),
      ...rows,
      timeline: [
        { key: 'placed', label: 'Placed', detail: precise(placedAt), state: 'done' },
        { key: 'book', label: 'On the book', detail: precise(appliedAt), state: 'done' },
        { key: 'filled', label: 'Filled', detail: 'waiting for a seller', state: 'waiting' },
      ],
      ledger: {
        type: 'order_lock',
        asset: 'USDT',
        free: signed(money.neg(lock), 2),
        locked: signed(lock, 2),
      },
    };
  }

  function card(m, list) {
    return {
      key: m.symbol,
      href: `/trade/${m.symbol}`,
      tile: tile(m.baseAsset),
      pair: pair(m.symbol),
      name: assetName(m.baseAsset, list),
      price: fmtPrice(m.ticker.last, m.tickSize),
      change: change(m.ticker.changePct),
      volume: millions(m.ticker.quoteVolume),
    };
  }

  function vm() {
    const t = tickers.get();
    const list = assets.get().list;
    const markets = t.markets;
    const byChange = [...markets].sort((a, b) => money.cmp(b.ticker.changePct, a.ticker.changePct));
    return {
      signedIn: session.get().status === 'user',
      hero: heroVm(markets),
      marketsStatus: t.status,
      strip: markets.map((m) => card(m, list)),
      movers: {
        gainers: byChange.filter((m) => money.isPositive(m.ticker.changePct)).slice(0, 3).map((m) => card(m, list)),
        losers: [...byChange].reverse().filter((m) => money.isNegative(m.ticker.changePct)).slice(0, 3).map((m) => card(m, list)),
        traded: [...markets].sort((a, b) => money.cmp(b.ticker.quoteVolume, a.ticker.quoteVolume)).slice(0, 3).map((m) => card(m, list)),
      },
    };
  }

  const actions = {
    retry() {
      loadMarkets();
      book.retry();
    },
  };

  return { get vm() { return vm(); }, actions, subscribe: p.subscribe, dispose: p.dispose };
}
