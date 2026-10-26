// Pieces the sign-in pages share (section 5, Auth pages): GoogleButton, the
// "or" rule, PasswordField with its Show button, PasswordStrengthMeter, the
// brand panel's words for each page, and the demo sign-in helper, which isn't
// on the boards and says so.

import { h, cx } from '../../dom.js';
import { Field } from '../ui/Field.js';

/** Google's button, text only until Google sign-in works (section 8). */
export function GoogleButton({ label, onClick }) {
  return h('button', { type: 'button', class: 'btn btn-secondary btn-lg btn-block google-btn', onClick }, label);
}

export function OrRule() {
  return h('div', { class: 'auth-or', role: 'separator', 'aria-label': 'or' }, h('span', { 'aria-hidden': 'true' }, 'or'));
}

/** A password field whose Show button reveals what was typed. */
export function PasswordField({ id, value, show, onInput, onToggle, error, autocomplete, labelExtra = null, hint, describedBy = null }) {
  return Field({
    id,
    label: 'Password',
    type: show ? 'text' : 'password',
    value,
    autocomplete,
    error,
    hint,
    labelExtra,
    describedBy,
    onInput,
    trailing: h('button', {
      type: 'button',
      class: 'input-trailing',
      'aria-controls': id,
      'aria-pressed': String(show),
      'aria-label': show ? 'Hide the password' : 'Show the password',
      onClick: onToggle,
    }, show ? 'Hide' : 'Show'),
  });
}

/** Four bars, a word and a hint (section 5, PasswordStrengthMeter). */
export function PasswordStrengthMeter(meter, { id }) {
  return h('div', { class: cx('strength', `strength-${meter.tone}`), id },
    h('div', { class: 'strength-bars', 'aria-hidden': 'true' }, [0, 1, 2, 3].map((i) => h('span', { class: cx('strength-bar', { on: i < meter.bars }) }))),
    h('p', { class: 'strength-text', 'aria-live': 'polite' },
      meter.label ? h('strong', {}, `${meter.label} `) : null,
      meter.hint));
}

/** The brand panel on Log in. */
export function LoginAside(facts) {
  return h('div', { class: 'auth-pitch' },
    h('p', { class: 'auth-pitch-title' }, 'A real matching engine.', h('br'), 'Practice money.'),
    h('p', { class: 'auth-pitch-lede' }, 'Trade BTC, ETH, SOL and BNB against USDT on a price-time order book, starting with 10,000 demo USDT.'),
    h('dl', { class: 'auth-facts' }, facts.map((f) => h('div', { key: f.key, class: 'auth-fact' },
      h('dt', {}, f.label),
      h('dd', { class: f.mono ? 't-mono' : null }, f.value)))));
}

/** The brand panel on the code step. */
export function TwoFactorAside() {
  return h('div', { class: 'auth-pitch' },
    h('p', { class: 'auth-pitch-title' }, 'One more step.'),
    h('p', { class: 'auth-pitch-lede' }, 'Two-factor is on for this account, so a password alone can\'t open it. Each code works once and lasts 30 seconds.'));
}

/** The brand panel on Register. */
export function RegisterAside() {
  return h('div', { class: 'auth-pitch auth-pitch-register' },
    h('p', { class: 'auth-credit' }, h('span', { class: 'auth-credit-amount' }, '10,000'), ' ', h('span', { class: 'auth-credit-asset' }, 'USDT')),
    h('p', { class: 'auth-credit-line' }, 'of demo money, ready when your account is.'),
    h('ol', { class: 'auth-steps' },
      h('li', {}, h('span', { class: 'auth-step-no t-mono' }, '01'), 'Create the account and confirm your email.'),
      h('li', {}, h('span', { class: 'auth-step-no t-mono' }, '02'), 'Place a limit order and watch it join the queue.'),
      h('li', {}, h('span', { class: 'auth-step-no t-mono' }, '03'), 'Read the ledger entries each fill writes.')));
}

/**
 * The demo sign-in helper: the mock's accounts and a button to fill each in.
 * `code` shows the trader's code instead, on the code step.
 */
export function DemoSignIn({ accounts, onUse, code = null, onUseCode = null }) {
  return h('aside', { class: 'demo-signin', 'aria-labelledby': 'demo-signin-title' },
    h('div', { class: 'demo-signin-head' },
      h('h2', { class: 'demo-signin-title', id: 'demo-signin-title' }, 'Demo sign-in'),
      h('span', { class: 'undesigned-note' }, 'Not drawn: demo only')),
    h('p', { class: 'demo-signin-body' }, 'This sign-in is a mock: nothing leaves your browser.'),
    code
      ? h('p', { class: 'demo-signin-code' },
        h('span', { class: 't-mono demo-signin-detail' }, `The demo trader's code is ${code}`),
        h('button', { type: 'button', class: 'link', onClick: onUseCode }, 'Fill it in'))
      : h('ul', { class: 'plain demo-signin-list' }, accounts.map((a) => h('li', { key: a.key, class: 'demo-signin-row' },
        h('strong', {}, a.label),
        h('span', { class: 't-mono demo-signin-detail' }, a.detail),
        h('button', { type: 'button', class: 'link', 'aria-label': `Fill in the ${a.label} account`, onClick: () => onUse(a.key) }, 'Fill in')))));
}
