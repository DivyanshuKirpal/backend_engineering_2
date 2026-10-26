// useFeesPresenter (section 5, FeesPage): the maker and taker fee, minimum
// order and tick of every market, and the withdrawal fee and minimum of
// every asset, from the market and asset lists everyone can read.

import { tickers, loadMarkets } from '../../models/stores/ticker.store.js';
import { assets, loadAssets } from '../../models/stores/asset.store.js';
import { createPresenter } from '../shared/presenter.js';
import { pair, plain, rate } from '../formatters/number.format.js';
import { marketStatus } from '../formatters/status.format.js';

const ORDER = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB'];

export function createFeesPresenter() {
  const p = createPresenter();
  p.own(tickers.subscribe(() => p.changed()));
  p.own(assets.subscribe(() => p.changed()));
  loadMarkets();
  loadAssets();

  return {
    get vm() {
      const t = tickers.get();
      const a = assets.get();
      if (t.status === 'error' || a.status === 'error') return { status: 'error' };
      if (t.status !== 'ready' || a.status !== 'ready') return { status: 'loading' };
      const byOrder = (x, y) => ORDER.indexOf(x.code) - ORDER.indexOf(y.code);
      return {
        status: 'ready',
        markets: t.markets.map((m) => ({
          key: m.symbol,
          icon: { code: m.baseAsset, letter: m.baseAsset[0] },
          market: pair(m.symbol),
          maker: rate(m.makerFeeRate),
          taker: rate(m.takerFeeRate),
          minOrder: `${plain(m.minNotional)} ${m.quoteAsset}`,
          minQty: `${plain(m.minQty)} ${m.baseAsset}`,
          tick: plain(m.tickSize),
          status: marketStatus(m.status),
        })),
        assets: [...a.list].sort(byOrder).map((x) => ({
          key: x.code,
          icon: { code: x.code, letter: x.code[0] },
          code: x.code,
          name: x.name,
          deposit: x.depositEnabled ? 'Free' : 'Paused',
          fee: x.withdrawEnabled ? `${plain(x.withdrawFee)} ${x.code}` : 'Paused',
          min: `${plain(x.minWithdraw)} ${x.code}`,
        })),
      };
    },
    actions: {
      retry() {
        loadMarkets();
        loadAssets();
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
