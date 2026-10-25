// The demo panel behind the header's "Simulator · demo funds" badge. Not on
// the boards: it explains that the app is a mock and holds the demo controls.

import { h } from '../../dom.js';

export function DemoControls(actions) {
  return h('div', {
    class: 'popover demo-panel', role: 'dialog', 'aria-label': 'Demo controls',
    ref: (el) => { if (!el.__focused) { el.__focused = true; el.querySelector('button')?.focus(); } },
    onKeyDown: (e) => e.key === 'Escape' && actions.close(),
  },
  h('h2', { class: 't-label' }, 'This is a simulator'),
  h('p', {}, 'Orichal runs on demo data inside your browser. No real money moves, and signing in is a mock: nothing is checked against a server.'),
  h('dl', { class: 'demo-accounts' },
    h('dt', {}, 'Trader'), h('dd', { class: 't-mono' }, 'demo@orichal.app · orichal-demo · 2FA 123456'),
    h('dt', {}, 'Admin'), h('dd', { class: 't-mono' }, 'admin@orichal.app · orichal-demo')),
  h('div', { class: 'demo-actions' },
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: actions.dropConnection }, 'Drop the live connection for 5 s'),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: actions.failNextRequest }, 'Make the next request fail'),
    h('button', { class: 'btn btn-danger-outline btn-sm', type: 'button', onClick: actions.resetDemo }, 'Reset demo data')),
  h('p', { class: 'undesigned-note' }, 'Not drawn yet: demo-only panel.'));
}
