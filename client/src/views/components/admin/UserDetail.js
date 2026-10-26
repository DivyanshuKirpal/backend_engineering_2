// UserProfileCard, UserActionsPanel and UserBalancesTable (section 5,
// AdminUserDetailPage). Not drawn yet: set like the KYC review panel and the
// wallet's balances.

import { h, cx } from '../../dom.js';
import { Select } from '../ui/Field.js';
import { StatusMarker } from '../ui/StatusMarker.js';
import { AssetIcon } from '../market/AssetIcon.js';

/** p: the presenter's profile { initials, admin, name, email, facts: [{ key, label, value?, marker?, mono? }] } */
export function UserProfileCard(p) {
  return h('section', { class: 'panel user-profile', 'aria-labelledby': 'user-profile-name' },
    h('div', { class: 'user-profile-head' },
      h('span', { class: cx('user-tile', { 'user-tile-admin': p.admin }), 'aria-hidden': 'true' }, p.initials),
      h('div', {},
        h('h2', { class: 'user-profile-name', id: 'user-profile-name' }, p.name),
        h('p', { class: 'user-profile-email' }, p.email))),
    h('dl', { class: 'user-facts' }, p.facts.map((f) => h('div', { key: f.key, class: `user-fact user-fact-${f.key}` },
      h('dt', {}, f.label),
      h('dd', { class: cx({ 't-mono': f.mono }) }, f.marker ? StatusMarker(f.marker) : f.value)))));
}

/** a: the presenter's actions vm; handlers: { startStatusChange, setRole, askRoleChange } */
export function UserActionsPanel(a, { startStatusChange, setRole, askRoleChange }) {
  return h('section', { class: 'panel user-actions', 'aria-label': 'What you can do' },
    h('div', { class: 'user-action' },
      h('div', { class: 'user-action-head' },
        h('h2', { id: 'user-status-title' }, 'Account'),
        StatusMarker(a.status)),
      h('p', { class: 'user-action-note' }, a.statusNote),
      h('button', {
        type: 'button',
        class: cx('btn', a.frozen ? 'btn-secondary' : 'btn-danger-outline'),
        disabled: a.statusDisabled,
        'aria-describedby': a.statusDisabledNote ? 'user-status-why' : null,
        onClick: startStatusChange,
      }, a.statusButton),
      a.statusDisabledNote ? h('p', { class: 'user-action-why', id: 'user-status-why' }, a.statusDisabledNote) : null),
    h('form', {
      class: 'user-action',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        askRoleChange();
      },
    },
    h('div', { class: 'user-action-head' },
      h('h2', {}, 'Role'),
      a.isAdmin ? h('span', { class: 'role-tag' }, a.roleLabel) : h('span', { class: 'user-role-now' }, a.roleLabel)),
    h('div', { class: 'user-role-row' },
      Select({ id: 'user-role', label: 'Change to', value: a.role, options: a.roleOptions, onChange: setRole, disabled: a.roleDisabled, hint: a.roleNote }),
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: a.roleDisabled || !a.roleChanged }, 'Change role'))));
}

/** b: { rows: [{ key, tile, code, name, total, free, held, value }], empty } */
export function UserBalancesTable(b) {
  return h('table', { class: 'table user-balances' },
    h('caption', { class: 'sr-only' }, 'Their balances, valued in USDT'),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col' }, 'Asset'),
      h('th', { scope: 'col', class: 'num' }, 'Total'),
      h('th', { scope: 'col', class: 'num' }, 'Free'),
      h('th', { scope: 'col', class: 'num' }, 'In orders'),
      h('th', { scope: 'col', class: 'num' }, 'Value · USDT'))),
    h('tbody', {}, b.rows.length
      ? b.rows.map((r) => h('tr', { key: r.key },
        h('th', { scope: 'row' }, h('span', { class: 'user-asset' }, AssetIcon(r.tile, { size: 'sm' }), r.code, h('span', { class: 'user-asset-name' }, r.name))),
        h('td', { class: 'num t-mono' }, r.total),
        h('td', { class: 'num t-mono' }, r.free),
        h('td', { class: 'num t-mono' }, r.held),
        h('td', { class: 'num t-mono user-value' }, r.value)))
      : h('tr', {}, h('td', { colspan: 5, class: 'user-empty' }, b.empty))));
}
