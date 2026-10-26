// Fields (UI kit, "Fields"; section 5: Input, NumberInput, Select,
// SearchInput). Every field has a real <label>, its hint and error are tied to
// it with aria-describedby, and an error sets aria-invalid. Values come from
// the presenter (controlled inputs); views only pass the typed text back.

import { h, cx } from '../../dom.js';
import { Icon } from './Icon.js';

const describedBy = (id, hint, error, extra = null) => [hint ? `${id}-hint` : null, error ? `${id}-error` : null, extra].filter(Boolean).join(' ') || null;

function Messages(id, hint, error) {
  return [
    error ? h('p', { id: `${id}-error`, class: 'field-error' }, error) : null,
    hint ? h('p', { id: `${id}-hint`, class: 'field-hint' }, hint) : null,
  ];
}

/**
 * A labelled text input. `trailing` is a node inside the field's right edge
 * (Show, Max); `describedBy` names another element that describes it.
 */
export function Field({
  id, label, value, type = 'text', placeholder, hint, error, autocomplete, inputmode, required = false,
  disabled = false, readOnly = false, mono = false, trailing = null, onInput, onBlur, onKeyDown, labelExtra = null, maxlength,
  describedBy: extraDescription = null,
}) {
  return h('div', { class: cx('field', { 'field-invalid': error }) },
    h('div', { class: 'field-label-row' },
      h('label', { class: 'field-label', for: id }, label),
      labelExtra),
    h('div', { class: cx('input-wrap', { 'has-trailing': trailing }) },
      h('input', {
        id, type, value, placeholder, autocomplete, inputmode, required, disabled, readonly: readOnly, maxlength,
        class: cx('input', { 't-mono': mono }),
        'aria-invalid': error ? 'true' : null,
        'aria-describedby': describedBy(id, hint, error, extraDescription),
        onInput: onInput ? (e) => onInput(e.target.value) : null,
        onBlur, onKeyDown,
      }),
      trailing),
    Messages(id, hint, error));
}

/**
 * A number field with its label inside on the left and a unit on the right
 * (UI kit, "Number with unit"; the order ticket), or with the label above it
 * (`labelOutside`, as on Deposit and Withdraw). `beside` sits to the box's
 * right, such as the deposit button. Decimal text, never an
 * <input type=number>, so values keep their exact digits.
 */
export function NumberField({
  id, label, value, unit, error, hint, disabled = false, readOnly = false, onInput, onBlur, trailing = null, placeholder = '', labelOutside = false,
  beside = null,
}) {
  const box = h('div', { class: 'number-box' },
    labelOutside ? null : h('label', { class: 'number-label', for: id }, label),
    h('input', {
      id, value, placeholder, disabled, readonly: readOnly,
      class: 'number-input t-mono',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-invalid': error ? 'true' : null,
      'aria-describedby': describedBy(id, hint, error),
      onInput: onInput ? (e) => onInput(e.target.value) : null,
      onBlur,
    }),
    unit ? h('span', { class: 'number-unit', 'aria-hidden': 'true' }, unit) : null,
    trailing);
  return h('div', { class: cx('number-field', { 'field-invalid': error, 'is-disabled': disabled, 'number-field-outside': labelOutside }) },
    labelOutside ? h('label', { class: 'field-label', for: id }, label) : null,
    beside ? h('div', { class: 'number-row' }, box, beside) : box,
    Messages(id, hint, error));
}

/**
 * A select. `inline` is the compact filter style with its label inside
 * ("Asset  All assets"), as on History and Admin · Users.
 */
export function Select({ id, label, value, options, onChange, inline = false, hint, error, disabled = false, leading = null }) {
  const select = h('select', {
    id, value, disabled,
    class: 'select',
    'aria-invalid': error ? 'true' : null,
    'aria-describedby': describedBy(id, hint, error),
    onChange: (e) => onChange(e.target.value),
  }, options.map((o) => h('option', { value: o.value, disabled: o.disabled ?? false }, o.label)));
  if (inline) {
    return h('div', { class: 'select-inline' },
      h('label', { class: 'select-inline-label', for: id }, label),
      select,
      Icon('chevron-down', { size: 14, className: 'select-chevron' }));
  }
  return h('div', { class: cx('field', { 'field-invalid': error }) },
    label ? h('label', { class: 'field-label', for: id }, label) : null,
    h('div', { class: cx('select-wrap', { 'has-leading': leading }) }, leading, select, Icon('chevron-down', { size: 16, className: 'select-chevron' })),
    Messages(id, hint, error));
}

export function SearchInput({ id, label, value, placeholder, onInput }) {
  return h('div', { class: 'search' },
    h('label', { class: 'sr-only', for: id }, label),
    Icon('search', { size: 16, className: 'search-icon' }),
    h('input', { id, type: 'search', value, placeholder, class: 'search-input', autocomplete: 'off', onInput: (e) => onInput(e.target.value) }));
}

export function Checkbox({ id, label, checked, onChange, hint, error, disabled = false, children = null }) {
  return h('div', { class: cx('check', { 'field-invalid': error }) },
    h('input', {
      id, type: 'checkbox', checked, disabled, class: 'check-input',
      'aria-invalid': error ? 'true' : null,
      'aria-describedby': describedBy(id, hint, error),
      onChange: (e) => onChange(e.target.checked),
    }),
    h('label', { for: id, class: 'check-label' }, children ?? label),
    Messages(id, hint, error));
}

/** Radio buttons drawn as cards (Verification: Passport, National ID, Driving licence). */
export function RadioCards({ name, legend, value, options, onChange, error }) {
  return h('fieldset', { class: cx('radio-cards', { 'field-invalid': error }) },
    h('legend', { class: 'field-label' }, legend),
    h('div', { class: 'radio-cards-row' }, options.map((o) => h('label', { class: cx('radio-card', { checked: o.value === value }) },
      h('input', { type: 'radio', name, value: o.value, checked: o.value === value, class: 'radio-input', onChange: () => onChange(o.value) }),
      h('span', {}, o.label)))),
    error ? h('p', { class: 'field-error' }, error) : null);
}
