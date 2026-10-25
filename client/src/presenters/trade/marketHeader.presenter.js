// useMarketHeaderPresenter (section 5, MarketHeader and MarketSelector): the
// pair, its live price and 24-hour figures, the market's rules (matching,
// tick, step, minimum order, fees), and the market switcher with its search.

import * as money from '../../models/domain/money.js';
import { tickers } from '../../models/stores/ticker.store.js';
import { assets } from '../../models/stores/asset.store.js';
import { fixed, price as fmtPrice, qty, change, pair, plain, rate, significant } from '../formatters/number.format.js';
import { tile, assetName } from '../formatters/asset.format.js';

export function createMarketHeaderPresenter(p, { symbol, market }) {
  let open = false;
  let query = '';

  function selectorRows() {
    const list = assets.get().list;
    const q = query.trim().toLowerCase();
    return tickers.get().markets
      .filter((m) => !q || m.symbol.toLowerCase().includes(q) || pair(m.symbol).toLowerCase().includes(q) || assetName(m.baseAsset, list).toLowerCase().includes(q))
      .map((m) => ({
        key: m.symbol,
        href: `/trade/${m.symbol}`,
        tile: tile(m.baseAsset),
        pair: pair(m.symbol),
        name: assetName(m.baseAsset, list),
        last: fmtPrice(m.ticker.last, m.tickSize),
        change: change(m.ticker.changePct),
        halted: m.status === 'halted',
        current: m.symbol === symbol,
      }));
  }

  return {
    vm() {
      const m = market();
      if (!m) return null;
      const t = m.ticker;
      const rows = open ? selectorRows() : [];
      return {
        pair: pair(symbol),
        name: assetName(m.baseAsset, assets.get().list),
        last: fmtPrice(t.last, m.tickSize),
        change: change(t.changePct),
        stats: [
          { key: 'high', label: '24h high', value: fmtPrice(t.high, m.tickSize) },
          { key: 'low', label: '24h low', value: fmtPrice(t.low, m.tickSize) },
          { key: 'volume', label: '24h volume', value: `${qty(t.volume, m.stepSize)} ${m.baseAsset}` },
        ],
        // The phone's one line: H 62,488.00 · L 60,912.35 · Vol 168.37 BTC
        summary: `H ${fmtPrice(t.high, m.tickSize)} · L ${fmtPrice(t.low, m.tickSize)} · Vol ${significant(t.volume)} ${m.baseAsset}`,
        specs: [
          { key: 'matching', label: 'Matching', value: 'Price, then time', words: true },
          { key: 'tick', label: 'Tick', value: plain(m.tickSize) },
          { key: 'step', label: 'Step', value: plain(m.stepSize) },
          { key: 'min', label: 'Min order', value: `${plain(m.minNotional)} ${m.quoteAsset}` },
          { key: 'fees', label: 'Maker · taker', value: `${fixed(money.mul(m.makerFeeRate, '100'), 2)} · ${rate(m.takerFeeRate)}`, title: 'Maker and taker fee' },
        ],
        selector: {
          open,
          query,
          rows,
          empty: open && !rows.length ? `No market matches "${query.trim()}".` : null,
        },
      };
    },
    actions: {
      toggleSelector() {
        open = !open;
        query = '';
        p.changed();
      },
      closeSelector() {
        if (!open) return;
        open = false;
        query = '';
        p.changed();
      },
      search(text) {
        query = text;
        p.changed();
      },
    },
  };
}
