// Parts the Deposit and Withdraw pages share (section 5): AssetSelect,
// DepositAddressCard, SimulateDepositForm, RecentTransactions (the side list
// that TransactionTable becomes beside a form) and the per-asset limits table.

import { h, cx } from '../../dom.js';
import { Select, NumberField } from '../ui/Field.js';
import { CopyButton } from '../ui/CopyButton.js';
import { Icon } from '../ui/Icon.js';
import { QrCode } from '../ui/QrCode.js';
import { StatusMarker } from '../ui/StatusMarker.js';
import { AssetIcon } from '../market/AssetIcon.js';

/** A select of assets with the picked one's tile inside it. */
export function AssetSelect({ id, label, value, options, tile, onChange }) {
  return Select({ id, label, value, options, onChange, leading: AssetIcon(tile) });
}

/** The address, its QR code and the warning not to send real coins. */
export function DepositAddressCard(vm) {
  if (vm.addressStatus === 'error') {
    return h('div', { class: 'funds-section deposit-address' }, h('p', { class: 'funds-error' }, 'The address didn\'t load.'));
  }
  if (!vm.address) {
    return h('div', { class: 'funds-section deposit-address', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, 'Loading the address'));
  }
  return h('div', { class: 'funds-section deposit-address' },
    h('div', { class: 'qr-box' }, QrCode({ text: vm.address.text, label: `QR code of the ${vm.code} deposit address` })),
    h('div', { class: 'deposit-address-body' },
      h('p', { class: 'field-label', id: 'deposit-address-label' }, vm.address.label),
      h('div', { class: 'address-field', role: 'group', 'aria-labelledby': 'deposit-address-label' },
        h('span', { class: 'address-text t-mono' }, vm.address.text),
        CopyButton({ value: vm.address.text, className: 'address-copy' })),
      h('p', { class: 'funds-warning' }, Icon('warning', { size: 16, className: 'funds-warning-icon' }), vm.warning)));
}

/** The simulated deposit: an amount up to the asset's limit. */
export function SimulateDepositForm(form, actions) {
  return h('form', {
    class: 'funds-section deposit-form',
    novalidate: true,
    'aria-labelledby': 'simulate-title',
    onSubmit: (e) => {
      e.preventDefault();
      actions.submit();
    },
  },
  h('h2', { class: 'funds-title', id: 'simulate-title' }, 'Simulate a deposit'),
  NumberField({
    id: 'deposit-amount', label: 'Amount', labelOutside: true, unit: form.unit, value: form.value, placeholder: form.placeholder,
    error: form.error, hint: form.note, disabled: form.disabled, onInput: actions.setAmount,
    beside: h('button', { type: 'submit', class: 'btn btn-primary deposit-submit', disabled: form.busy || form.disabled }, form.busy ? 'Depositing…' : 'Simulate deposit'),
  }));
}

/** A short list of transactions beside a form; "All history" opens the full table. */
export function RecentTransactions({ id, title, href, list, empty, note = null }) {
  let body;
  if (list.status === 'error') body = h('p', { class: 'recent-state' }, 'These didn\'t load.');
  else if (list.status !== 'ready') body = h('p', { class: 'recent-state', role: 'status' }, 'Loading…');
  else if (!list.rows.length) body = h('p', { class: 'recent-state' }, empty);
  else {
    body = h('ul', { class: 'plain recent-list' }, list.rows.map((r) => h('li', { key: r.key, class: 'recent-row' },
      h('p', { class: 'recent-line' },
        h('strong', { class: 'recent-asset' }, r.asset),
        h('span', { class: cx('recent-amount t-mono', r.tone ? `tone-${r.tone}` : 'tone-buy') }, r.amount),
        h('span', { class: 'recent-status' }, StatusMarker(r.status))),
      h('p', { class: 'recent-line recent-meta' },
        h('span', {}, r.when),
        r.action ?? h('span', { class: 't-mono recent-hash', title: r.hashFull }, r.hash)))));
  }
  return h('section', { class: 'panel recent-panel', 'aria-labelledby': id },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-label', id }, title),
      h('a', { class: 'link', href }, 'All history')),
    body,
    note ? h('p', { class: 'recent-note' }, note) : null);
}

/** One row of per-asset limits: MOST PER DEPOSIT, or fees and minimums. */
export function LimitsTable({ id, title, cells }) {
  return h('section', { class: 'panel limits-panel', 'aria-labelledby': id },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-label', id }, title)),
    h('dl', { class: 'limits' }, cells.map((c) => h('div', { key: c.key, class: 'limit' },
      h('dt', {}, c.code),
      h('dd', { class: 't-mono' }, c.value)))));
}
