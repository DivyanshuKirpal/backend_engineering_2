// useWalletPresenter (section 5, WalletPage): the total value, what is free
// and what is held, the allocation bar, and one row per asset, all valued at
// the live last prices (section 7, Allocation bar). Hide small balances drops
// rows worth under 1 USDT and is saved on the account (PATCH /users/me).

import * as money from '../../models/domain/money.js';
import { valuePortfolio, isSmall } from '../../models/domain/portfolio.rules.js';
import * as userApi from '../../models/api/user.api.js';
import { balances, loadBalances } from '../../models/stores/balance.store.js';
import { tickers, loadMarkets, lastPrices } from '../../models/stores/ticker.store.js';
import { assets, loadAssets, assetByCode } from '../../models/stores/asset.store.js';
import { preferences, setPreferences } from '../../models/stores/preferences.store.js';
import { setUser } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { lastMarket } from '../shared/lastMarket.js';
import { errorToast } from '../shared/toasts.js';
import { fixed, amount } from '../formatters/number.format.js';
import { tile, assetName } from '../formatters/asset.format.js';

/** Wallet tables show USDT to the cent and coins to their decimals; zero is "0" (board Wallet). */
function shown(asset, value) {
  if (money.isZero(value)) return '0';
  return asset === 'USDT' ? fixed(value, 2) : amount(value, assetByCode(asset)?.decimals ?? 8);
}

export function createWalletPresenter() {
  const p = createPresenter();
  for (const store of [balances, tickers, assets, preferences]) p.own(store.subscribe(() => p.changed()));
  loadBalances();
  loadMarkets();
  loadAssets();

  function vm() {
    const b = balances.get();
    if (b.status === 'error') return { status: 'error', error: 'Your balances didn\'t load.' };
    if (b.status !== 'ready' || tickers.get().status !== 'ready') return { status: 'loading' };

    const prices = lastPrices();
    const list = assets.get().list;
    const { rows, total, free, held } = valuePortfolio(b.list, prices);
    const hideSmall = preferences.get().hideSmallBalances;
    const shownRows = rows.filter((r) => !hideSmall || !isSmall(r.value));
    const trade = (asset) => `/trade/${asset === 'USDT' ? lastMarket.get().symbol : `${asset}-USDT`}`;

    return {
      status: 'ready',
      overview: {
        total: fixed(total, 2),
        free: fixed(free, 2),
        held: fixed(held, 2),
      },
      allocation: {
        // The fixed order keeps neighbours from changing as prices move
        segments: rows.filter((r) => money.isPositive(r.value)).map((r) => ({
          key: r.asset,
          asset: r.asset.toLowerCase(),
          grow: money.toNumber(r.value),
          label: `${r.asset} ${fixed(r.share, 1)}%`,
        })),
        legend: rows.filter((r) => money.isPositive(r.value)).map((r) => ({
          key: r.asset,
          asset: r.asset.toLowerCase(),
          code: r.asset,
          share: `${fixed(r.share, 1)}%`,
          value: fixed(r.value, 2),
        })),
        empty: money.isZero(total),
      },
      hideSmall,
      hiddenCount: rows.length - shownRows.length,
      rows: shownRows.map((r) => {
        const a = assetByCode(r.asset);
        const canWithdraw = Boolean(a?.withdrawEnabled) && money.isPositive(r.available);
        return {
          key: r.asset,
          tile: tile(r.asset),
          code: r.asset,
          name: assetName(r.asset, list),
          total: shown(r.asset, r.total),
          free: shown(r.asset, r.available),
          held: shown(r.asset, r.locked),
          value: fixed(r.value, 2),
          deposit: a?.depositEnabled ? `/wallet/deposit?asset=${r.asset}` : null,
          withdraw: canWithdraw ? `/wallet/withdraw?asset=${r.asset}` : null,
          withdrawNote: canWithdraw ? null : `Nothing to withdraw: no free ${r.asset}`,
          trade: trade(r.asset),
        };
      }),
    };
  }

  return {
    get vm() { return vm(); },
    actions: {
      async setHideSmall(on) {
        const before = preferences.get().hideSmallBalances;
        setPreferences({ hideSmallBalances: Boolean(on) });
        try {
          const { user } = await userApi.updateMe({ preferences: { ...preferences.get() } });
          setUser(user);
        } catch (err) {
          setPreferences({ hideSmallBalances: before });
          errorToast('The setting wasn\'t saved', err);
        }
      },
      retry: () => loadBalances(),
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
