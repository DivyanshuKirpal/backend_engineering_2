// UserFilters and UserTable (section 5; board Admin · Users): search by name
// or email with the role and status filters, then one row per person with
// their account and identity-check status and a link to their page.

import { h, cx } from '../../dom.js';
import { SearchInput, Select } from '../ui/Field.js';
import { StatusMarker } from '../ui/StatusMarker.js';

/** f: { search, role, roleOptions, status, statusOptions } */
export function UserFilters(f, { setSearch, setRole, setStatus }) {
  return h('div', { class: 'users-filters' },
    SearchInput({ id: 'users-search', label: 'Search by name or email', value: f.search, placeholder: 'Search by name or email', onInput: setSearch }),
    Select({ id: 'users-role', label: 'Role', value: f.role, options: f.roleOptions, onChange: setRole, inline: true }),
    Select({ id: 'users-status', label: 'Status', value: f.status, options: f.statusOptions, onChange: setStatus, inline: true }));
}

/** rows: the users presenter's rows; empty: what to say when there are none. */
export function UserTable({ rows, empty }) {
  return h('table', { class: 'table users-table' },
    h('caption', { class: 'sr-only' }, 'People, newest first'),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', class: 'col-name' }, 'Name'),
      h('th', { scope: 'col', class: 'col-email' }, 'Email'),
      h('th', { scope: 'col', class: 'col-role' }, 'Role'),
      h('th', { scope: 'col', class: 'col-status' }, 'Status'),
      h('th', { scope: 'col', class: 'col-kyc' }, 'KYC'),
      h('th', { scope: 'col', class: 'col-joined' }, 'Joined'),
      h('th', { scope: 'col', class: 'col-login' }, 'Last login'),
      h('th', { scope: 'col', class: 'col-open' }, h('span', { class: 'sr-only' }, 'Open')))),
    h('tbody', {}, rows.length
      ? rows.map((r) => h('tr', { key: r.key },
        h('th', { scope: 'row', class: 'col-name' },
          h('span', { class: cx('user-tile', { 'user-tile-admin': r.admin }), 'aria-hidden': 'true' }, r.initials),
          r.name),
        h('td', {}, r.email),
        h('td', {}, r.admin ? h('span', { class: 'role-tag' }, r.role) : r.role),
        h('td', {}, StatusMarker(r.status)),
        h('td', {}, StatusMarker(r.kyc)),
        h('td', { class: 't-mono' }, r.joined),
        h('td', { class: 't-mono' }, r.lastLogin),
        h('td', { class: 'num' }, h('a', { class: 'link', href: r.href, 'aria-label': `Open ${r.name}` }, 'Open'))))
      : h('tr', {}, h('td', { colspan: 8, class: 'users-empty' }, empty))));
}
