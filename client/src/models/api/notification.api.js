// Notification endpoints (section 4, Notifications, stretch).

import { get, patch } from './http.js';

/** -> { items: [Notification], nextCursor, unreadCount } */
export const list = ({ unread, cursor, limit } = {}) => get('/notifications', { unread: unread ? 'true' : undefined, cursor, limit });
/** -> { notification } */
export const markRead = (id) => patch(`/notifications/${encodeURIComponent(id)}/read`);
/** -> { updated } */
export const markAllRead = () => patch('/notifications/read-all');
