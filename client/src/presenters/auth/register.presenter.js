// useRegisterPresenter (section 5, RegisterPage; section 4, POST
// /auth/register): display name, email and password with the strength meter,
// and the tick for the Terms and the Risk notice, which the form alone checks
// (section 7, Rules the screens state). A new account starts with 10,000 demo
// USDT and an unconfirmed email.

import * as authApi from '../../models/api/auth.api.js';
import { strength, MIN_LENGTH } from '../../models/domain/password.rules.js';
import { createPresenter } from '../shared/presenter.js';
import { startUser } from '../shared/session.presenter.js';
import { navigate } from '../shared/navigation.js';
import { toast } from '../shared/toasts.js';
import { safeNext } from './login.presenter.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const LEVELS = {
  empty: { label: '', tone: 'none' },
  weak: { label: 'Too weak.', tone: 'sell' },
  fair: { label: 'Fair.', tone: 'wait' },
  good: { label: 'Good.', tone: 'ink' },
  strong: { label: 'Strong.', tone: 'buy' },
};

/** The meter under the password: four bars, a word, and what would raise it. */
export function strengthMeter(password) {
  const s = strength(password);
  if (s.level === 'empty') return { bars: 0, label: '', hint: `At least ${MIN_LENGTH} characters.`, tone: 'none' };
  let hint = '';
  if (!s.longEnough) hint = `Use at least ${MIN_LENGTH} characters.`;
  else if (s.missing.includes('numberOrSymbol')) hint = `Add a number or symbol to make it ${s.score >= 3 ? 'strong' : 'stronger'}.`;
  else if (s.missing.includes('length')) hint = 'Use 12 or more characters to make it strong.';
  else if (s.level !== 'strong') hint = 'Mix in capitals, numbers or symbols to make it strong.';
  return { bars: Math.max(1, s.score), label: LEVELS[s.level].label, hint, tone: LEVELS[s.level].tone };
}

export function createRegisterPresenter({ next } = {}) {
  const p = createPresenter();
  const target = safeNext(next);
  let displayName = '';
  let email = '';
  let password = '';
  let showPassword = false;
  let agreed = false;
  let busy = false;
  let errors = {};

  function check() {
    const e = {};
    const name = displayName.trim();
    if (!name) e.displayName = 'Enter a display name.';
    else if (name.length < 2 || name.length > 40) e.displayName = 'Display names are 2 to 40 characters.';
    if (!email.trim()) e.email = 'Enter your email.';
    else if (!EMAIL.test(email.trim())) e.email = 'That doesn\'t look like an email address.';
    const s = strength(password);
    if (!password) e.password = 'Choose a password.';
    else if (!s.longEnough) e.password = `Use at least ${MIN_LENGTH} characters.`;
    else if (s.score < 2) e.password = 'Make it a little stronger: longer, or with a number or symbol.';
    if (!agreed) e.agreed = 'Tick the box to go on.';
    return e;
  }

  const clear = (...keys) => {
    if (keys.some((k) => errors[k]) || errors.form) {
      errors = { ...errors, form: null };
      for (const k of keys) errors[k] = null;
    }
  };

  return {
    get vm() {
      return {
        busy,
        displayName,
        email,
        password,
        showPassword,
        agreed,
        errors,
        meter: strengthMeter(password),
        loginHref: target ? `/login?next=${encodeURIComponent(target)}` : '/login',
      };
    },
    actions: {
      setDisplayName(v) {
        displayName = v;
        clear('displayName');
        p.changed();
      },
      setEmail(v) {
        email = v;
        clear('email');
        p.changed();
      },
      setPassword(v) {
        password = v;
        clear('password');
        p.changed();
      },
      toggleShow() {
        showPassword = !showPassword;
        p.changed();
      },
      setAgreed(v) {
        agreed = Boolean(v);
        clear('agreed');
        p.changed();
      },
      async submit() {
        if (busy) return;
        errors = check();
        if (Object.values(errors).some(Boolean)) {
          p.changed();
          return;
        }
        busy = true;
        p.changed();
        try {
          const result = await authApi.register({ email: email.trim(), password, displayName: displayName.trim() });
          startUser(result);
          toast({ title: 'Your account is ready', body: '10,000 demo USDT is in your wallet. We sent a link to confirm your email.', tone: 'success' });
          navigate(target ?? '/markets', { replace: true });
        } catch (err) {
          const field = Object.keys(err?.details ?? {})[0];
          if (field && ['email', 'displayName', 'password'].includes(field)) errors = { [field]: err.message };
          else errors = { form: err?.message ?? 'The account wasn\'t created. Try again.' };
        } finally {
          busy = false;
          p.changed();
        }
      },
      google() {
        toast({ title: 'Google sign-up needs the server', body: 'It arrives with the backend. Create a demo account with the form instead.', tone: 'info' });
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
