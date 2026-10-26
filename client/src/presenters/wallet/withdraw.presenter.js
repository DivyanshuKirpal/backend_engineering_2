// useWithdrawPresenter (section 5, WithdrawPage; section 6, flow D): pick an
// asset (?asset=), a simulated address, an amount that includes the fee, and
// the 2FA code when two-factor is on. withdrawal.rules checks it all, a
// confirmation follows, then POST /wallet/withdrawals locks the amount until
// an admin decides. Withdrawals need approved KYC; until then the page shows
// the way to it. Pending withdrawals can be cancelled from the side list.

import * as money from '../../models/domain/money.js';
import * as rules from '../../models/domain/withdrawal.rules.js';
import * as walletApi from '../../models/api/wallet.api.js';
import * as kycApi from '../../models/api/kyc.api.js';
import { assets, loadAssets, assetByCode } from '../../models/stores/asset.store.js';
import { balances, loadBalances, freeByAsset } from '../../models/stores/balance.store.js';
import { session } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { navigate } from '../shared/navigation.js';
import { toast, errorToast } from '../shared/toasts.js';
import { plain, shortAddress } from '../formatters/number.format.js';
import { dayTime, fullDate } from '../formatters/date.format.js';
import { kycStatus, transactionStatus } from '../formatters/status.format.js';
import { tile } from '../formatters/asset.format.js';
import { walletAmount } from './deposit.presenter.js';

const PICK_ORDER = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB'];
const clean = (text) => String(text ?? '').replace(/[\s,]/g, '');

/** What the page says while KYC isn't approved, by its status. */
const KYC_NOTICES = {
  none: () => ({
    title: 'Verify your identity to withdraw.',
    body: 'It takes a few minutes. Deposits and trading work without it.',
    actionLabel: 'Verify your identity',
    href: '/account/verification',
  }),
  pending: () => ({
    title: 'Your identity check is under review.',
    body: 'Withdrawals open as soon as an admin approves it. Deposits and trading work meanwhile.',
    actionLabel: 'See its status',
    href: '/account/verification',
  }),
  rejected: (application) => ({
    title: 'Your identity check was rejected.',
    body: `${application?.rejectReason ? `The reason: ${application.rejectReason}. ` : ''}Send it again to open withdrawals.`,
    actionLabel: 'Try again',
    href: '/account/verification',
  }),
};

export function createWithdrawPresenter({ asset: wanted } = {}) {
  const p = createPresenter();
  let code = String(wanted ?? 'USDT').toUpperCase();
  let address = '';
  let amountText = '';
  let otp = '';
  let showErrors = false;
  let serverErrors = {};
  let confirming = false;
  let busy = false;
  let kyc = null;
  let pending = null;
  let cancelling = null;

  for (const store of [assets, balances, session]) p.own(store.subscribe(() => p.changed()));
  loadAssets();
  loadBalances();

  async function loadKyc() {
    try {
      kyc = await kycApi.mine();
    } catch {
      kyc = { status: session.get().user?.kycStatus ?? 'none', application: null };
    }
    p.changed();
  }

  async function loadPending() {
    try {
      const data = await walletApi.transactions({ type: 'withdrawal', status: 'pending', limit: 20 });
      if (p.disposed) return;
      pending = data.items;
    } catch {
      pending = pending ?? [];
    }
    p.changed();
  }

  loadKyc();
  loadPending();

  function order(a) {
    return { address: address.trim(), amount: clean(amountText), code: otp };
  }

  function check(a) {
    const user = session.get().user ?? {};
    return rules.validate(a, order(a), freeByAsset()[a.code] ?? '0', user);
  }

  function amountError(a, e) {
    if (!e) return null;
    switch (e.code) {
      case 'required': return 'Enter an amount.';
      case 'decimals': return `${a.code} amounts have at most ${e.decimals} decimals.`;
      case 'min': return `The minimum is ${plain(e.min)} ${a.code}.`;
      case 'fee': return `The amount must be more than the ${plain(a.withdrawFee)} ${a.code} fee.`;
      case 'balance': return `You have ${walletAmount(a.code, e.free)} ${a.code} free.`;
      default: return null;
    }
  }

  function addressError(a, e) {
    if (!e) return null;
    if (e.code === 'required') return 'Enter the address to send to.';
    return `Use a simulated ${a.code} address: sim-${a.code.toLowerCase()}- and 16 hex characters.`;
  }

  function pick(next, { replace = false } = {}) {
    code = next;
    amountText = '';
    serverErrors = {};
    showErrors = false;
    navigate(`/wallet/withdraw?asset=${code}`, { replace });
  }

  p.own(assets.subscribe(() => {
    if (assets.get().status === 'ready' && !assetByCode(code)) pick('USDT', { replace: true });
  }));

  return {
    get vm() {
      const a = assetByCode(code);
      if (assets.get().status === 'error') return { status: 'error' };
      if (!a || !kyc || balances.get().status !== 'ready') return { status: 'loading' };
      const user = session.get().user ?? {};
      const approved = user.kycStatus === 'approved';
      const result = check(a);
      const e = showErrors ? result.errors : {};
      const sum = rules.summary(a, clean(amountText));
      const free = freeByAsset()[a.code] ?? '0';
      const approvedOn = kyc.application?.reviewedAt ? `Approved ${fullDate(kyc.application.reviewedAt)}. ` : '';

      return {
        status: 'ready',
        approved,
        twoFactor: Boolean(user.twoFactorEnabled),
        frozen: user.status === 'frozen',
        kycCard: approved
          ? { status: kycStatus('approved'), title: 'Identity verified', body: `${approvedOn}Withdrawals stay open while it's approved.` }
          : null,
        kycNotice: approved ? null : KYC_NOTICES[user.kycStatus]?.(kyc.application) ?? KYC_NOTICES.none(),
        code,
        tile: tile(code),
        options: [...assets.get().list]
          .sort((x, y) => PICK_ORDER.indexOf(x.code) - PICK_ORDER.indexOf(y.code))
          .map((x) => ({ value: x.code, label: `${x.code} · ${x.name}`, disabled: !x.withdrawEnabled })),
        free: { amount: walletAmount(code, free), asset: code },
        address: {
          value: address,
          error: serverErrors.address ?? addressError(a, e.address),
          hint: 'Simulated addresses only. They start with sim-.',
        },
        amount: {
          value: amountText,
          placeholder: code === 'USDT' ? '0.00' : money.fixed('0', a.decimals),
          error: serverErrors.amount ?? amountError(a, e.amount),
        },
        summary: {
          leaves: sum ? `${walletAmount(code, sum.leaves)} ${code}` : `— ${code}`,
          fee: `−${walletAmount(code, a.withdrawFee)} ${code}`,
          receive: sum ? `${walletAmount(code, sum.receive)} ${code}` : `— ${code}`,
        },
        otp: {
          value: otp,
          error: serverErrors.code ?? (e.code ? 'Enter the 6-digit code from your app.' : null),
          hint: 'Two-factor is on for this account, so every withdrawal needs a fresh code.',
        },
        formError: serverErrors.form ?? null,
        button: {
          label: busy ? 'Requesting…' : sum ? `Request withdrawal of ${walletAmount(code, sum.leaves)} ${code}` : 'Request withdrawal',
          disabled: busy || !approved || user.status === 'frozen' || !a.withdrawEnabled,
        },
        note: sum
          ? `The ${walletAmount(code, sum.leaves)} ${code} stays locked in your wallet until an admin approves or rejects the request. Minimum ${plain(a.minWithdraw)} ${code}.`
          : `The amount stays locked in your wallet until an admin approves or rejects the request. Minimum ${plain(a.minWithdraw)} ${code}.`,
        confirm: confirming && sum
          ? {
            title: 'Request this withdrawal?',
            body: `${walletAmount(code, sum.receive)} ${code} goes to ${shortAddress(address.trim())} once an admin approves it. Until then ${walletAmount(code, sum.leaves)} ${code} stays locked in your wallet.`,
            busy,
          }
          : null,
        pending: pending == null
          ? { status: 'loading' }
          : {
            status: 'ready',
            rows: pending.map((t) => ({
              key: t.id,
              asset: t.asset,
              amount: `−${walletAmount(t.asset, t.amount)}`,
              tone: 'sell',
              status: transactionStatus(t.status),
              when: `${dayTime(t.createdAt)} · to ${shortAddress(t.address)}`,
              cancelling: cancelling === t.id,
            })),
          },
        fees: [...assets.get().list]
          .sort((x, y) => PICK_ORDER.indexOf(x.code) - PICK_ORDER.indexOf(y.code))
          .map((x) => ({ key: x.code, code: x.code, fee: plain(x.withdrawFee), min: plain(x.minWithdraw) })),
      };
    },
    actions: {
      pick: (next) => pick(next),
      syncAsset(next) {
        const c = String(next ?? 'USDT').toUpperCase();
        if (c === code) return;
        code = c;
        amountText = '';
        serverErrors = {};
        showErrors = false;
        p.changed();
      },
      setAddress(v) {
        address = v;
        serverErrors = { ...serverErrors, address: null, form: null };
        p.changed();
      },
      setAmount(v) {
        if (/^[\d,\s]*\.?\d*$/.test(v)) amountText = v;
        serverErrors = { ...serverErrors, amount: null, form: null };
        p.changed();
      },
      max() {
        const a = assetByCode(code);
        if (!a) return;
        amountText = money.fixed(freeByAsset()[code] ?? '0', code === 'USDT' ? 2 : a.decimals, 'down');
        serverErrors = { ...serverErrors, amount: null };
        p.changed();
      },
      setCode(v) {
        otp = String(v).replace(/\D/g, '').slice(0, 6);
        serverErrors = { ...serverErrors, code: null };
        p.changed();
      },
      /** Checks the form, then asks to confirm. */
      submit() {
        const a = assetByCode(code);
        if (!a) return;
        showErrors = true;
        serverErrors = {};
        const result = check(a);
        const fields = ['address', 'amount', ...(session.get().user?.twoFactorEnabled ? ['code'] : [])];
        if (fields.some((f) => result.errors[f]) || result.errors.form) {
          p.changed();
          return;
        }
        confirming = true;
        p.changed();
      },
      cancelConfirm() {
        confirming = false;
        p.changed();
      },
      async confirm() {
        const a = assetByCode(code);
        if (!a || busy) return;
        busy = true;
        p.changed();
        try {
          const o = order(a);
          await walletApi.withdraw({ asset: code, amount: o.amount, address: o.address, code: session.get().user?.twoFactorEnabled ? otp : undefined });
          toast({ title: 'Withdrawal requested', body: `${walletAmount(code, o.amount)} ${code} is locked until an admin reviews it.`, tone: 'success' });
          amountText = '';
          otp = '';
          showErrors = false;
          confirming = false;
          loadPending();
        } catch (err) {
          confirming = false;
          if (err?.code === 'INVALID_2FA_CODE') serverErrors = { code: 'That code didn\'t work. Use the current one from your app.' };
          else if (err?.details?.amount) serverErrors = { amount: err.message };
          else if (err?.details?.address) serverErrors = { address: err.message };
          else serverErrors = { form: err?.message ?? 'The withdrawal wasn\'t requested. Try again.' };
          otp = '';
        } finally {
          busy = false;
          p.changed();
        }
      },
      async cancelPending(id) {
        if (cancelling) return;
        cancelling = id;
        p.changed();
        try {
          const { transaction } = await walletApi.cancelWithdrawal(id);
          toast({ title: 'Withdrawal cancelled', body: `${walletAmount(transaction.asset, transaction.amount)} ${transaction.asset} is free again.`, tone: 'info' });
          await loadPending();
        } catch (err) {
          errorToast('The withdrawal wasn\'t cancelled', err);
        } finally {
          cancelling = null;
          p.changed();
        }
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
