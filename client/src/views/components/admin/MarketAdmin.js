// MarketAdminTable and MarketFormModal (section 5, AdminMarketsPage). Not
// drawn yet: the table follows Fees, the form the account pages' fields.

import { h } from '../../dom.js';
import { Modal } from '../ui/Overlay.js';
import { NumberField, Select } from '../ui/Field.js';
import { StatusMarker } from '../ui/StatusMarker.js';
import { AssetIcon } from '../market/AssetIcon.js';

/** rows: the markets presenter's rows. actions: { startEdit, askHalt, askResume } */
export function MarketAdminTable(rows, { startEdit, askHalt, askResume }) {
  const head = [['Market'], ['Status'], ['Maker', 'num'], ['Taker', 'num'], ['Smallest order', 'num'], ['Smallest amount', 'num'], ['Price step', 'num'], ['Amount step', 'num'], [null, 'num']];
  return h('table', { class: 'table market-admin-table' },
    h('caption', { class: 'sr-only' }, 'Every market with its fees and limits'),
    h('thead', {}, h('tr', {}, head.map(([label, cls]) => h('th', { scope: 'col', class: cls }, label ?? h('span', { class: 'sr-only' }, 'Actions'))))),
    h('tbody', {}, rows.map((r) => h('tr', { key: r.key },
      h('th', { scope: 'row' }, h('span', { class: 'market-admin-name' }, AssetIcon(r.tile, { size: 'sm' }), r.market)),
      h('td', {}, StatusMarker(r.status, { size: 'sm' })),
      h('td', { class: 'num t-mono' }, r.maker),
      h('td', { class: 'num t-mono' }, r.taker),
      h('td', { class: 'num t-mono' }, r.minOrder),
      h('td', { class: 'num t-mono' }, r.minQty),
      h('td', { class: 'num t-mono' }, r.tick),
      h('td', { class: 'num t-mono' }, r.step),
      h('td', { class: 'num' }, h('span', { class: 'market-admin-actions' },
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'aria-label': `Edit ${r.market}`, onClick: () => startEdit(r.key) }, 'Edit'),
        r.canPause
          ? r.halted
            ? h('button', { type: 'button', class: 'btn btn-buy btn-sm', 'aria-label': `Resume ${r.market}`, onClick: () => askResume(r.key) }, 'Resume')
            : h('button', { type: 'button', class: 'btn btn-danger-outline btn-sm', 'aria-label': `Halt ${r.market}`, onClick: () => askHalt(r.key) }, 'Halt')
          : null))))));
}

const NumberRow = (fields, setField) => h('div', { class: 'market-form-row' }, fields.map((f) => NumberField({
  id: f.id,
  label: f.label,
  value: f.value,
  unit: f.unit,
  error: f.error,
  hint: f.hint,
  disabled: f.disabled,
  labelOutside: true,
  onInput: (v) => setField(f.key, v),
})));

/** form: the markets presenter's form vm. actions: { setField, submitForm, closeForm } */
export function MarketFormModal(form, { setField, submitForm, closeForm }) {
  return Modal({ title: form.title, titleId: 'market-form-title', onClose: closeForm, className: 'market-form-dialog' },
    h('form', {
      class: 'dialog-form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        submitForm();
      },
    },
    h('div', { class: 'dialog-body market-form' },
      form.base
        ? h('div', { class: 'market-form-row' },
          Select({ id: 'market-baseAsset', label: 'Asset', value: form.base.value, options: form.base.options, error: form.base.error, hint: form.base.hint, onChange: (v) => setField('baseAsset', v) }),
          Select({ id: 'market-quoteAsset', label: 'Quoted in', value: form.quote.value, options: form.quote.options, hint: form.quote.hint, disabled: true, onChange: () => {} }))
        : null,
      h('fieldset', { class: 'market-form-group' }, h('legend', { class: 'panel-label' }, 'Fees'), NumberRow(form.fees, setField),
        form.feeNote ? h('p', { class: 'field-hint' }, form.feeNote) : null),
      h('fieldset', { class: 'market-form-group' }, h('legend', { class: 'panel-label' }, 'Minimums'), NumberRow(form.limits, setField)),
      h('fieldset', { class: 'market-form-group' }, h('legend', { class: 'panel-label' }, 'Tick and step'), NumberRow(form.rules, setField)),
      form.error ? h('p', { class: 'field-error market-form-error', role: 'alert' }, form.error) : null),
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: closeForm }, 'Close'),
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: form.busy }, form.busy ? 'Saving…' : form.submitLabel))));
}
