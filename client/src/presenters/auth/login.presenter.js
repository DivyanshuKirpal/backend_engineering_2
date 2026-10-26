// useLoginPresenter (section 5, LoginPage; section 4, Auth): email and
// password, then the 6-digit code step when the account has two-factor on,
// with the tries left on its ticket (section 7, Rules the screens state).
// Five wrong passwords pause sign-in for 15 minutes. Signing in is a mock in
// this phase, so the page offers to fill in the demo accounts.

import * as authApi from '../../models/api/auth.api.js';
import { tickers, loadMarkets } from '../../models/stores/ticker.store.js';
import { createPresenter } from '../shared/presenter.js';
import { startUser } from '../shared/session.presenter.js';
import { navigate } from '../shared/navigation.js';
import { toast } from '../shared/toasts.js';
import { DEMO_ACCOUNTS } from '../shared/demoAccounts.js';
import { rate } from '../formatters/number.format.js';
import { hourMinute } from '../formatters/date.format.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_LENGTH = 6;

/** Only a path on this site can be a place to return to after signing in. */
export function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

/** The brand panel's facts, from the markets the exchange lists. */
export function exchangeFacts() {
  const markets = tickers.get().markets;
  const bases = markets.map((m) => m.baseAsset);
  const quote = markets[0]?.quoteAsset ?? 'USDT';
  const first = markets[0];
  return [
    { key: 'markets', label: 'Markets', value: bases.length ? `${bases.join(' · ')}, in ${quote}` : '—' },
    { key: 'matching', label: 'Matching', value: 'Price first, then time' },
    { key: 'credit', label: 'Sign-up credit', value: `10,000 ${quote}`, mono: true },
    {
      key: 'fees',
      label: 'Fees',
      value: first ? `${rate(first.makerFeeRate)} maker · ${rate(first.takerFeeRate)} taker` : '—',
      mono: true,
    },
  ];
}

export function createLoginPresenter({ next } = {}) {
  const p = createPresenter();
  const target = safeNext(next);
  let step = 'password';
  let email = '';
  let password = '';
  let showPassword = false;
  let code = '';
  let ticket = null;
  let attemptsLeft = 5;
  let busy = false;
  let errors = {};
  let codeError = null;
  // The code a failed try was sent with, so the same six digits don't resend themselves
  let lastTried = null;

  p.own(tickers.subscribe(() => p.changed()));
  loadMarkets();

  function enter({ user, accessToken }) {
    startUser({ user, accessToken });
    navigate(target ?? (user.role === 'admin' ? '/admin' : '/markets'), { replace: true });
  }

  function check() {
    const e = {};
    if (!email.trim()) e.email = 'Enter your email.';
    else if (!EMAIL.test(email.trim())) e.email = 'That doesn\'t look like an email address.';
    if (!password) e.password = 'Enter your password.';
    return e;
  }

  async function submitCode() {
    if (busy || code.length !== CODE_LENGTH) return;
    busy = true;
    codeError = null;
    lastTried = code;
    p.changed();
    try {
      enter(await authApi.loginTwoFactor({ loginTicket: ticket, code }));
    } catch (err) {
      if (err?.code === 'INVALID_2FA_CODE') {
        attemptsLeft = err.details?.attemptsLeft ?? Math.max(0, attemptsLeft - 1);
        codeError = 'That code didn\'t work. Check the app and try the current one.';
        code = '';
      } else {
        // The ticket ran out of tries or expired: start again from the password.
        step = 'password';
        ticket = null;
        code = '';
        password = '';
        errors = { form: err?.message ?? 'Sign-in didn\'t finish. Try again.' };
      }
    } finally {
      busy = false;
      p.changed();
    }
  }

  function setCode(v) {
    code = String(v).replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (codeError && code) codeError = null;
    p.changed();
    // Six digits send themselves, as authenticator codes usually do
    if (code.length === CODE_LENGTH && code !== lastTried) submitCode();
  }

  // On the code step: the demo account's code, when it is a demo account signing in
  const demoCode = () => DEMO_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase())?.code ?? null;

  return {
    get vm() {
      const shownAttempts = `${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left`;
      return {
        step,
        busy,
        email,
        password,
        showPassword,
        errors,
        code,
        codeError,
        attempts: shownAttempts,
        signingInAs: email.trim(),
        demoCode: step === 'code' ? demoCode() : null,
        facts: exchangeFacts(),
        registerHref: target ? `/register?next=${encodeURIComponent(target)}` : '/register',
        demo: DEMO_ACCOUNTS.map((a) => ({
          key: a.key,
          label: a.label,
          detail: a.code ? `${a.email} · ${a.password} · code ${a.code}` : `${a.email} · ${a.password}`,
        })),
      };
    },
    actions: {
      setEmail(v) {
        email = v;
        if (errors.email || errors.form) errors = { ...errors, email: null, form: null };
        p.changed();
      },
      setPassword(v) {
        password = v;
        if (errors.password || errors.form) errors = { ...errors, password: null, form: null };
        p.changed();
      },
      toggleShow() {
        showPassword = !showPassword;
        p.changed();
      },
      useDemo(key) {
        const account = DEMO_ACCOUNTS.find((a) => a.key === key);
        if (!account) return;
        email = account.email;
        password = account.password;
        errors = {};
        p.changed();
      },
      async submit() {
        if (busy) return;
        errors = check();
        if (errors.email || errors.password) {
          p.changed();
          return;
        }
        busy = true;
        p.changed();
        try {
          const result = await authApi.login({ email: email.trim(), password });
          if (result.requires2fa) {
            step = 'code';
            ticket = result.loginTicket;
            attemptsLeft = 5;
            code = '';
            codeError = null;
            lastTried = null;
          } else {
            enter(result);
          }
        } catch (err) {
          if (err?.code === 'ACCOUNT_LOCKED' && err.details?.lockUntil) {
            errors = { form: `Too many wrong passwords. Sign-in is paused until ${hourMinute(err.details.lockUntil)}.` };
          } else {
            errors = { form: err?.message ?? 'Sign-in didn\'t work. Try again.' };
          }
          password = '';
        } finally {
          busy = false;
          p.changed();
        }
      },
      setCode,
      submitCode,
      useDemoCode() {
        const c = demoCode();
        if (c) setCode(c);
      },
      differentAccount() {
        step = 'password';
        ticket = null;
        code = '';
        password = '';
        codeError = null;
        errors = {};
        p.changed();
      },
      google() {
        toast({ title: 'Google sign-in needs the server', body: 'It arrives with the backend. For now, use a demo account below the form.', tone: 'info' });
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
