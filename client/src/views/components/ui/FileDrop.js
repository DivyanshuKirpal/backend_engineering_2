// FileDrop (board Account · Verification): a dashed box to choose a file or
// drop one on, over a real file input, so the keyboard and screen readers
// use it as usual. Once a file is chosen it shows the name and size, with
// Remove. An optional one is drawn with a lighter dash.

import { h, cx } from '../../dom.js';
import { Icon } from './Icon.js';

/** file: { name, size } or null. onFile(File | null). */
export function FileDrop({ id, label, file, error, hint, icon = 'upload', optional = false, accept = 'image/jpeg,image/png', onFile }) {
  const over = (on) => (e) => {
    e.preventDefault();
    e.currentTarget.classList.toggle('over', on);
  };
  const described = [`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return h('div', { class: cx('field', 'file-drop', { 'file-drop-optional': optional, 'field-invalid': error }) },
    h('span', { class: 'field-label', id: `${id}-label` }, label),
    file
      ? h('div', { class: 'file-drop-chosen' },
        Icon('check', { size: 16, className: 'file-drop-tick' }),
        h('span', { class: 'file-drop-name' }, file.name),
        h('span', { class: 'file-drop-size' }, file.size),
        h('button', { type: 'button', class: 'link', 'aria-label': `Remove ${file.name}`, onClick: () => onFile(null) }, 'Remove'))
      : h('label', {
        class: 'file-drop-zone',
        for: id,
        onDragOver: over(true),
        onDragLeave: over(false),
        onDrop: (e) => {
          over(false)(e);
          onFile(e.dataTransfer?.files?.[0] ?? null);
        },
      },
      Icon(icon, { size: 20, className: 'file-drop-icon' }),
      h('span', { class: 'file-drop-title' }, 'Choose a file or drop it here'),
      h('span', { class: 'file-drop-hint', id: `${id}-hint` }, hint)),
    file ? null : h('input', {
      id,
      type: 'file',
      class: 'file-drop-input',
      accept,
      'aria-labelledby': `${id}-label`,
      'aria-describedby': described,
      'aria-invalid': error ? 'true' : null,
      onChange: (e) => {
        const chosen = e.target.files?.[0] ?? null;
        e.target.value = '';
        if (chosen) onFile(chosen);
      },
    }),
    error ? h('p', { class: 'field-error', id: `${id}-error` }, error) : null);
}
