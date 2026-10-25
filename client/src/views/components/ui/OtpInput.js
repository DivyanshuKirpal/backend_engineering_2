// OtpInput (section 5; UI kit, "Six-digit code"). One real input, so screen
// readers, autofill (one-time-code) and paste all work as usual; the six boxes
// drawn over it are decoration. The box after the typed digits gets the ink frame.

import { h, cx } from '../../dom.js';

export function OtpInput({ id, label, value, onInput, error, hint, length = 6, disabled = false }) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, length);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || null;
  return h('div', { class: cx('field', 'otp', { 'field-invalid': error }) },
    h('label', { class: 'field-label', for: id }, label),
    h('div', { class: 'otp-boxes' },
      h('input', {
        id,
        value: digits,
        disabled,
        class: 'otp-input',
        inputmode: 'numeric',
        autocomplete: 'one-time-code',
        pattern: '[0-9]*',
        maxlength: length,
        'aria-invalid': error ? 'true' : null,
        'aria-describedby': describedBy,
        onInput: (e) => {
          const clean = e.target.value.replace(/\D/g, '').slice(0, length);
          if (clean !== e.target.value) e.target.value = clean;
          onInput(clean);
        },
      }),
      Array.from({ length }, (_, i) => h('span', {
        class: cx('otp-box', { filled: i < digits.length, active: i === Math.min(digits.length, length - 1) && !disabled }),
        'aria-hidden': 'true',
      }, digits[i] ?? ''))),
    error ? h('p', { id: `${id}-error`, class: 'field-error' }, error) : null,
    hint ? h('div', { id: `${id}-hint`, class: 'field-hint otp-hint' }, hint) : null);
}
