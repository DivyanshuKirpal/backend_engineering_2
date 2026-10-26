// useAdminUsersPresenter (section 5, AdminUsersPage): people, newest first,
// ten to a page from GET /admin/users; searched by name or email (as you
// type, after a pause) and filtered by role and status. Bot accounts are
// left out by the API.

import * as adminApi from '../../models/api/admin.api.js';
import { createPresenter } from '../shared/presenter.js';
import { initials } from '../shared/navbar.presenter.js';
import { dayMonth, listTime } from '../formatters/date.format.js';
import { accountStatus, kycShort, roleLabel } from '../formatters/status.format.js';

const PAGE = 10;
const SEARCH_PAUSE = 250;

export function createAdminUsersPresenter() {
  const p = createPresenter();
  let search = '';
  let role = 'all';
  let status = 'all';
  let page = 1;
  let list = { status: 'loading', items: [], total: 0, page: 1 };
  let people = null;
  let token = 0;
  let timer = null;

  async function load() {
    const mine = ++token;
    if (list.status !== 'ready') list = { ...list, status: 'loading' };
    p.changed();
    try {
      const data = await adminApi.users({
        search: search.trim() || undefined,
        role: role === 'all' ? undefined : role,
        status: status === 'all' ? undefined : status,
        page,
        limit: PAGE,
      });
      if (mine !== token || p.disposed) return;
      list = { status: 'ready', items: data.items, total: data.total, page: data.page };
      if (!search.trim() && role === 'all' && status === 'all') people = data.total;
    } catch {
      if (mine !== token || p.disposed) return;
      list = { ...list, status: 'error' };
    }
    p.changed();
  }
  load();
  p.own(() => clearTimeout(timer));

  const refilter = () => {
    page = 1;
    load();
  };

  function kyc(s) {
    const marker = kycShort(s);
    return s === 'none' ? { ...marker, marker: 'none', tone: 'muted' } : marker;
  }

  return {
    get vm() {
      const pages = Math.max(1, Math.ceil(list.total / PAGE));
      // The rows on screen say which page they are, until the next one arrives
      const first = list.total ? (list.page - 1) * PAGE + 1 : 0;
      const last = Math.min(list.page * PAGE, list.total);
      const filtered = Boolean(search.trim()) || role !== 'all' || status !== 'all';
      return {
        subtitle: people != null ? `${people} people · the two bot accounts are hidden` : null,
        filters: {
          search,
          role,
          roleOptions: [{ value: 'all', label: 'All roles' }, { value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }],
          status,
          statusOptions: [{ value: 'all', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'frozen', label: 'Frozen' }],
        },
        status: list.status,
        rows: list.items.map((u) => ({
          key: u.id,
          initials: initials(u.displayName),
          name: u.displayName,
          email: u.email,
          admin: u.role === 'admin',
          role: roleLabel(u.role),
          status: accountStatus(u.status),
          kyc: kyc(u.kycStatus),
          joined: dayMonth(u.createdAt),
          lastLogin: u.lastLoginAt ? listTime(u.lastLoginAt) : 'Never',
          href: `/admin/users/${u.id}`,
        })),
        summary: list.total ? `Showing ${first}–${last} of ${list.total}, newest first` : '',
        empty: filtered ? 'No one matches these filters.' : 'No one has signed up yet.',
        pagination: { pages, current: page },
      };
    },
    actions: {
      setSearch(value) {
        search = value;
        p.changed();
        clearTimeout(timer);
        timer = setTimeout(refilter, SEARCH_PAUSE);
      },
      setRole(value) {
        role = value;
        refilter();
      },
      setStatus(value) {
        status = value;
        refilter();
      },
      setPage(n) {
        page = n;
        load();
      },
      retry: () => load(),
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
