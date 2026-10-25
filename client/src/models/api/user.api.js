// Account endpoints (section 4, Account). Each resolves with the response's data.

import { get, patch, post, put, del } from './http.js';

/** -> { user } */
export const me = () => get('/users/me');
/** -> { user } */
export const updateMe = ({ displayName, preferences }) => patch('/users/me', { displayName, preferences });
/** -> { changed: true } */
export const changePassword = ({ currentPassword, newPassword }) => patch('/users/me/password', { currentPassword, newPassword });

/** -> { otpauthUrl, manualKey } */
export const setupTwoFactor = () => post('/users/me/2fa/setup');
/** -> { twoFactorEnabled: true } */
export const enableTwoFactor = ({ code }) => post('/users/me/2fa/enable', { code });
/** -> { twoFactorEnabled: false } */
export const disableTwoFactor = ({ code, password }) => post('/users/me/2fa/disable', { code, password });

/** -> { sessions: [Session] } */
export const sessions = () => get('/users/me/sessions');
/** -> null (204) */
export const revokeSession = (id) => del(`/users/me/sessions/${encodeURIComponent(id)}`);
/** -> { revoked } */
export const revokeOtherSessions = () => del('/users/me/sessions');
/** -> { items: [{ action, ip, device, createdAt }], nextCursor } */
export const activity = ({ cursor, limit } = {}) => get('/users/me/activity', { cursor, limit });

/** -> { watchlist: [symbol] } */
export const watchlist = () => get('/users/me/watchlist');
export const star = (symbol) => put(`/users/me/watchlist/${encodeURIComponent(symbol)}`);
export const unstar = (symbol) => del(`/users/me/watchlist/${encodeURIComponent(symbol)}`);
