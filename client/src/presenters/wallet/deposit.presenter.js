// useDepositPresenter (section 5, DepositPage; section 4, Wallet): pick an
// asset (?asset= in the address), see its simulated address and QR, and
// credit a simulated deposit up to the asset's demoDepositLimit. Card deposits
// are Stretch and need Stripe on the server, so that tab explains itself.
// Recent deposits come from GET /wallet/transactions?type=deposit.

import * as money from '../../models/domain/money.js';
import * as walletApi from '../../models/api/wallet.api.js';
import { assets, loadAssets, assetByCode } from '../../models/stores/asset.store.js';
import { session } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { navigate } from '../shared/navigation.js';
import { toast } from '../shared/toasts.js';
import { fixed, amount as fmtAmount, plain, shortAddress } from '../formatters/number.format.js';
import { dayTime } from '../formatters/date.format.js';
import { transactionStatus } from '../formatters/status.format.js';
import { tile } from '../formatters/asset.format.js';

// The board lists the limits coins first, then USDT.
const LIMIT_ORDER = ['BTC', 'ETH', 'SOL', 'BNB', 'USDT'];
const PICK_ORDER = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB'];

/** Amounts as the wallet shows them: USDT to the cent, coins to their decimals. */
export function walletAmount(asset, value) {
  return asset === 'USDT' ? fixed(value, 2) : fmtAmount(value, assetByCode(asset)?.decimals ?? 8);
}

export function createDepositPresenter({ asset: wanted } = {}) {
  const p = createPresenter();
  let code = String(wanted ?? 'USDT').toUpperCase();
  let method = 'simulated';
  let address = null;
  let addressFailed = false;
  let amountText = '';
  let amountError = null;
  let busy = false;
  let recent = null;
  let recentFailed = false;
  let addressToken = 0;

  p.own(assets.subscribe(() => {
    // An unknown ?asset= falls back to USDT once the list is in.
    if (assets.get().status === 'ready' && !assetByCode(code)) pick('USDT', { replace: true });
    p.changed();
  }));
  loadAssets();

  async function loadAddress() {
    const mine = ++addressToken;
    address = null;
    addressFailed = false;
    p.changed();
    try {
      const data = await walletApi.depositAddress(code);
      if (mine !== addressToken || p.disposed) return;
      address = data.address;
    } catch {
      if (mine !== addressToken || p.disposed) return;
      addressFailed = true;
    }
    p.changed();
  }

  async function loadRecent() {
    try {
      const data = await walletApi.transactions({ type: 'deposit', limit: 5 });
      if (p.disposed) return;
      recent = data.items;
      recentFailed = false;
    } catch {
      if (p.disposed) return;
      recentFailed = true;
    }
    p.changed();
  }

  function pick(next, { replace = false } = {}) {
    code = next;
    amountText = '';
    amountError = null;
    if (code !== 'USDT') method = 'simulated';
    navigate(`/wallet/deposit?asset=${code}`, { replace });
    loadAddress();
  }

  loadAddress();
  loadRecent();

  function check(a) {
    const v = amountText.replace(/[\s,]/g, '');
    if (!v) return 'Enter an amount.';
    if (!money.isDecimal(v) || !money.isPositive(v)) return 'Enter an amount above zero.';
    if (!money.fitsDecimals(v, a.decimals)) return `${a.code} amounts have at most ${a.decimals} decimals.`;
    if (money.gt(v, a.demoDepositLimit)) return `Simulated deposits are at most ${plain(a.demoDepositLimit)} ${a.code}.`;
    return null;
  }

  return {
    get vm() {
      const list = assets.get().list;
      const a = assetByCode(code);
      if (assets.get().status !== 'ready' || !a) return { status: assets.get().status === 'error' ? 'error' : 'loading' };
      const frozen = session.get().user?.status === 'frozen';
      return {
        status: 'ready',
        code,
        name: a.name,
        tile: tile(code),
        options: [...list]
          .sort((x, y) => PICK_ORDER.indexOf(x.code) - PICK_ORDER.indexOf(y.code))
          .map((x) => ({ value: x.code, label: `${x.code} · ${x.name}`, disabled: !x.depositEnabled })),
        methods: [
          { key: 'simulated', label: 'Simulated', current: method === 'simulated' },
          { key: 'card', label: 'Card', note: 'USDT, test mode', current: method === 'card', disabled: code !== 'USDT' },
        ],
        method,
        address: address ? { text: address, label: `Your ${code} deposit address · simulated` } : null,
        addressStatus: addressFailed ? 'error' : address ? 'ready' : 'loading',
        warning: `This address exists only inside Orichal. Don't send real ${code} to it: anything sent from outside is lost.`,
        form: {
          value: amountText,
          placeholder: money.fixed('0', a.decimals),
          unit: code,
          error: amountError,
          busy,
          disabled: frozen || !a.depositEnabled,
          note: frozen
            ? 'This account is frozen, so it can\'t deposit.'
            : `Up to ${plain(a.demoDepositLimit)} ${code} per deposit. It lands at once and writes a deposit entry to your ledger.`,
        },
        recent: recentFailed
          ? { status: 'error' }
          : recent
            ? {
              status: 'ready',
              rows: recent.map((t) => {
                const st = transactionStatus(t.status);
                return {
                  key: t.id,
                  asset: t.asset,
                  amount: `+${walletAmount(t.asset, t.amount)}`,
                  status: st,
                  when: `${dayTime(t.createdAt)} · ${t.method}`,
                  hash: t.txHash ? shortAddress(t.txHash) : '—',
                  hashFull: t.txHash,
                };
              }),
            }
            : { status: 'loading' },
        limits: LIMIT_ORDER.map((c) => assetByCode(c)).filter(Boolean).map((x) => ({ key: x.code, code: x.code, limit: plain(x.demoDepositLimit) })),
      };
    },
    actions: {
      pick: (next) => pick(next),
      /** The address bar changed (back, forward or a link): follow its ?asset=. */
      syncAsset(next) {
        const c = String(next ?? 'USDT').toUpperCase();
        if (c === code) return;
        code = c;
        amountText = '';
        amountError = null;
        if (code !== 'USDT') method = 'simulated';
        loadAddress();
      },
      setMethod(next) {
        if (next === 'card' && code !== 'USDT') return;
        method = next;
        p.changed();
      },
      setAmount(text) {
        if (/^[\d,\s]*\.?\d*$/.test(text)) amountText = text;
        amountError = null;
        p.changed();
      },
      async submit() {
        const a = assetByCode(code);
        if (!a || busy) return;
        amountError = check(a);
        if (amountError) {
          p.changed();
          return;
        }
        busy = true;
        p.changed();
        try {
          const { transaction } = await walletApi.deposit({ asset: code, amount: amountText.replace(/[\s,]/g, '') });
          toast({ title: 'Deposit completed', body: `${walletAmount(code, transaction.amount)} ${code} is in your wallet.`, tone: 'success' });
          amountText = '';
          loadRecent();
        } catch (err) {
          amountError = err?.message ?? 'The deposit didn\'t go through. Try again.';
        } finally {
          busy = false;
          p.changed();
        }
      },
      retry() {
        loadAddress();
        loadRecent();
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
