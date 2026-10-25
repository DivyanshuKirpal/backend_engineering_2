// Unread count and the latest notifications (section 1, notification.store),
// fed by notification events and reloaded after a reconnect.

import { createStore } from './createStore.js';
import * as notificationApi from '../api/notification.api.js';
import { socket } from '../realtime/socket.js';

export const notifications = createStore({ status: 'idle', items: [], unreadCount: 0, error: null });

const LATEST = 8;

export async function loadNotifications() {
  try {
    const data = await notificationApi.list({ limit: LATEST });
    notifications.set({ status: 'ready', items: data.items, unreadCount: data.unreadCount, error: null });
  } catch (error) {
    notifications.set({ status: 'error', error });
  }
}

export function clearNotifications() {
  notifications.set({ status: 'idle', items: [], unreadCount: 0, error: null });
}

export async function markAllRead() {
  await notificationApi.markAllRead();
  notifications.set((s) => ({ ...s, unreadCount: 0, items: s.items.map((n) => ({ ...n, read: true })) }));
}

export async function markRead(id) {
  await notificationApi.markRead(id);
  notifications.set((s) => ({
    ...s,
    unreadCount: Math.max(0, s.unreadCount - (s.items.find((n) => n.id === id && !n.read) ? 1 : 0)),
    items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
  }));
}

socket.on('notification', ({ notification }) => {
  if (notifications.get().status !== 'ready') return;
  notifications.set((s) => ({ ...s, items: [notification, ...s.items].slice(0, LATEST), unreadCount: s.unreadCount + 1 }));
});

socket.on('reconnect', () => {
  if (notifications.get().status === 'ready') loadNotifications();
});
