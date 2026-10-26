// WithdrawForm and WithdrawalSummary (section 5; board Withdraw): the asset
// with what is free, a simulated address, the amount with the fee included
// (and Max), what leaves the wallet, the fee and what they receive, the 2FA
// code when two-factor is on, and the request button.

import { h } from '../../dom.js';
import { Field, NumberField } from '../ui/Field.js';
import { OtpInput } from '../ui/OtpInput.js';
import { AssetSelect } from './FundsParts.js';

/** What leaves the wallet, the network fee, and what the address receives. */
export function WithdrawalSummary(s) {
  return h('dl', { class: 'withdraw-summary' },
    h('div', { class: 'withdraw-summary-row' }, h('dt', {}, 'Leaves your wallet'), h('dd', { class: 't-mono' }, s.leaves)),
    h('div', { class: 'withdraw-summary-row' }, h('dt', {}, 'Network fee'), h('dd', { class: 't-mono' }, s.fee)),
    h('div', { class: 'withdraw-summary-row withdraw-summary-total' }, h('dt', {}, 'They receive'), h('dd', { class: 't-mono' }, s.receive)));
}

/** vm: the withdraw presenter's vm (status 'ready', KYC approved). */
export function WithdrawForm(vm, actions) {
  return h('form', {
    class: 'funds-section withdraw-form',
    novalidate: true,
    'aria-label': `Withdraw ${vm.code}`,
    'aria-describedby': vm.formError ? 'withdraw-error' : null,
    onSubmit: (e) => {
      e.preventDefault();
      actions.submit();
    },
  },
  vm.formError ? h('p', { class: 'auth-error withdraw-error', id: 'withdraw-error', role: 'alert' }, vm.formError) : null,
  h('div', { class: 'withdraw-asset' },
    AssetSelect({ id: 'withdraw-asset', label: 'Asset', value: vm.code, options: vm.options, tile: vm.tile, onChange: actions.pick }),
    h('p', { class: 'withdraw-free' }, 'Free ', h('span', { class: 't-mono withdraw-free-amount' }, vm.free.amount), ' ', vm.free.asset)),
  Field({
    id: 'withdraw-address', label: 'To address', value: vm.address.value, mono: true, autocomplete: 'off',
    error: vm.address.error, hint: vm.address.hint, onInput: actions.setAddress,
  }),
  NumberField({
    id: 'withdraw-amount', label: 'Amount, fee included', labelOutside: true, unit: vm.code,
    value: vm.amount.value, placeholder: vm.amount.placeholder, error: vm.amount.error, onInput: actions.setAmount,
    trailing: h('button', { type: 'button', class: 'max-btn', onClick: actions.max, 'aria-label': `Use all your free ${vm.code}` }, 'Max'),
  }),
  WithdrawalSummary(vm.summary),
  vm.twoFactor
    ? h('div', { class: 'withdraw-code' },
      OtpInput({ id: 'withdraw-code', label: 'Authenticator code', value: vm.otp.value, error: vm.otp.error, hint: vm.otp.hint, onInput: actions.setCode }))
    : null,
  h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block withdraw-submit', disabled: vm.button.disabled }, vm.button.label),
  h('p', { class: 'withdraw-note' }, vm.note));
}
