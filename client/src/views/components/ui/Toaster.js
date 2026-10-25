// Toasts (UI kit, "Toasts (sonner)"): ink boxes with a tick or a cross.
// The container is a polite live region, so screen readers hear each one.

import { h } from '../../dom.js';
import { Icon } from './Icon.js';

export function Toaster({ items }, { dismiss }) {
  return h('ol', { class: 'toaster plain', 'aria-label': 'Notifications' },
    items.map((t) => h('li', { key: t.id, class: `toast toast-${t.tone}`, role: t.tone === 'error' ? 'alert' : 'status' },
      h('span', { class: 'toast-icon' }, Icon(t.tone === 'error' ? 'cross' : t.tone === 'success' ? 'check' : 'check', { size: 16 })),
      h('div', { class: 'toast-text' },
        h('p', { class: 'toast-title' }, t.title),
        t.body ? h('p', { class: t.mono ? 'toast-body t-mono' : 'toast-body' }, t.body) : null),
      h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss', onClick: () => dismiss(t.id) }, Icon('cross', { size: 14 })))));
}
