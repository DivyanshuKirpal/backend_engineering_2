// useNavbarPresenter (section 5): the header, the verify-email banner, the
// admin sidebar's queue counts and the demo controls, for every layout.

import * as authApi from '../../models/api/auth.api.js';
import * as adminApi from '../../models/api/admin.api.js';
import { failNextRequest, resetDemo } from '../../models/api/mock/server.js';
import { session } from '../../models/stores/session.store.js';
import { connection } from '../../models/stores/connection.store.js';
import { notifications, markAllRead, markRead } from '../../models/stores/notification.store.js';
import { socket } from '../../models/realtime/socket.js';
import { createPresenter, every } from './presenter.js';
import { endUser } from './session.presenter.js';
import { toast, errorToast } from './toasts.js';
import { listTime } from '../formatters/date.format.js';
import { lastMarket } from './lastMarket.js';
import { navigate } from './navigation.js';

const NAV = [
  { key: 'markets', label: 'Markets', href: '/markets', match: (p) => p === '/markets' || p.startsWith('/coins') },
  { key: 'trade', label: 'Trade', href: null, match: (p) => p.startsWith('/trade') },
  { key: 'convert', label: 'Convert', href: '/convert', match: (p) => p === '/convert' },
  { key: 'wallet', label: 'Wallet', href: '/wallet', match: (p) => p.startsWith('/wallet') },
  { key: 'orders', label: 'Orders', href: '/orders', match: (p) => p === '/orders' },
];

const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin', match: (p) => p === '/admin' },
  { key: 'users', label: 'Users', href: '/admin/users', match: (p) => p.startsWith('/admin/users') },
  { key: 'kyc', label: 'KYC review', href: '/admin/kyc', match: (p) => p === '/admin/kyc' },
  { key: 'withdrawals', label: 'Withdrawals', href: '/admin/withdrawals', match: (p) => p === '/admin/withdrawals' },
  { key: 'markets', label: 'Markets', href: '/admin/markets', match: (p) => p === '/admin/markets' },
  { key: 'assets', label: 'Assets', href: '/admin/assets', match: (p) => p === '/admin/assets' },
  { key: 'audit', label: 'Audit logs', href: '/admin/audit-logs', match: (p) => p === '/admin/audit-logs' },
  { key: 'system', label: 'System', href: '/admin/system', match: (p) => p === '/admin/system' },
];

const queueEvents = new EventTarget();

/** After an admin decides a KYC check or a withdrawal, the sidebar's counts reload at once. */
export function queuesChanged() {
  queueEvents.dispatchEvent(new Event('change'));
}

export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

export function createNavbarPresenter({ admin = false } = {}) {
  const p = createPresenter();
  let path = location.pathname;
  let open = null; // 'bell' | 'user' | 'menu' | 'demo'
  let resend = 'idle';
  let queues = { kyc: null, withdrawals: null };

  for (const store of [session, connection, notifications]) p.own(store.subscribe(() => p.changed()));
  p.own(lastMarket.subscribe(() => p.changed()));

  // Notifications nobody else shows: account, KYC and withdrawal news.
  p.own(socket.on('notification', ({ notification: n }) => {
    if (['security', 'kyc', 'withdrawal'].includes(n.type)) toast({ title: n.title, body: n.body, tone: 'success' });
  }));

  async function loadQueues() {
    if (session.get().user?.role !== 'admin') return;
    try {
      const s = await adminApi.stats();
      queues = { kyc: s.pendingKyc, withdrawals: s.pendingWithdrawals };
      p.changed();
    } catch {
      // The badges just stay as they were.
    }
  }
  if (admin) {
    loadQueues();
    every(p, 15000, loadQueues);
    queueEvents.addEventListener('change', loadQueues);
    p.own(() => queueEvents.removeEventListener('change', loadQueues));
  }

  const toggle = (name) => {
    open = open === name ? null : name;
    p.changed();
  };

  const actions = {
    setPath(next) {
      path = next;
      open = null;
      p.changed();
    },
    toggleBell: () => toggle('bell'),
    toggleUserMenu: () => toggle('user'),
    toggleMenu: () => toggle('menu'),
    toggleDemo: () => toggle('demo'),
    close() {
      if (!open) return;
      open = null;
      p.changed();
    },
    async markAllRead() {
      try {
        await markAllRead();
      } catch (err) {
        errorToast('Couldn\'t mark them as read', err);
      }
    },
    async readNotification(id) {
      open = null;
      p.changed();
      try {
        await markRead(id);
      } catch {
        // Reading still works; the dot clears next time.
      }
    },
    toggleTheme() {
      toast({ title: 'Light theme only, for now', body: 'The dark theme isn\'t designed yet, so Orichal stays light.' });
    },
    async logout() {
      open = null;
      await endUser();
      toast({ title: 'Logged out', body: 'This device no longer holds your session.' });
      navigate('/');
    },
    async resendVerification() {
      resend = 'sending';
      p.changed();
      try {
        await authApi.resendVerification();
        resend = 'sent';
        toast({ title: 'Link sent', body: `We sent a new link to ${session.get().user?.email}. In this demo it confirms itself in a few seconds.` });
      } catch (err) {
        resend = 'idle';
        errorToast('Couldn\'t send the link', err);
      }
      p.changed();
    },
    async resetDemo() {
      open = null;
      p.changed();
      await resetDemo();
      location.assign('/');
    },
    dropConnection() {
      open = null;
      socket.simulateDrop(5000);
      p.changed();
    },
    failNextRequest() {
      failNextRequest();
      toast({ title: 'The next request will fail', body: 'Use the page as normal to see its error state.' });
      open = null;
      p.changed();
    },
  };

  function vm() {
    const { status, user } = session.get();
    const signedIn = status === 'user';
    const n = notifications.get();
    const c = connection.get();
    const state = c.socket === 'connected' ? 'live' : c.socket === 'reconnecting' ? 'reconnecting' : 'connecting';
    return {
      path,
      signedIn,
      restoring: status === 'unknown',
      nav: NAV.map((item) => ({ key: item.key, label: item.label, href: item.href ?? `/trade/${lastMarket.get().symbol}`, current: item.match(path) })),
      adminNav: ADMIN_NAV.map((item) => ({
        key: item.key,
        label: item.label,
        href: item.href,
        current: item.match(path),
        badge: item.key === 'kyc' ? queues.kyc || null : item.key === 'withdrawals' ? queues.withdrawals || null : null,
      })),
      connection: signedIn ? {
        state,
        label: state === 'live' ? 'Matching engine live' : state === 'reconnecting' ? 'Reconnecting… prices may be stale' : 'Connecting…',
      } : null,
      bell: signedIn ? {
        count: n.unreadCount > 0 ? String(n.unreadCount > 99 ? '99+' : n.unreadCount) : null,
        label: n.unreadCount ? `Notifications, ${n.unreadCount} unread` : 'Notifications',
        open: open === 'bell',
        canMarkAll: n.unreadCount > 0,
        items: n.items.map((x) => ({ id: x.id, title: x.title, body: x.body, time: listTime(x.createdAt), unread: !x.read, href: x.link ?? '/notifications' })),
        empty: n.status === 'ready' && n.items.length === 0,
      } : null,
      theme: { label: 'Theme: light. The dark theme isn\'t designed yet.' },
      user: signedIn ? {
        initials: initials(user.displayName),
        name: user.displayName,
        email: user.email,
        isAdmin: user.role === 'admin',
        open: open === 'user',
      } : null,
      verifyBanner: signedIn && !user.emailVerified ? {
        email: user.email,
        sending: resend === 'sending',
        sent: resend === 'sent',
      } : null,
      menuOpen: open === 'menu',
      demoOpen: open === 'demo',
    };
  }

  return { get vm() { return vm(); }, actions, subscribe: p.subscribe, dispose: p.dispose };
}
