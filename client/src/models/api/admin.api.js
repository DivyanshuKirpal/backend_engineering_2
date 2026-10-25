// Admin endpoints (section 4, Admin).

import { get, patch, post } from './http.js';

/** -> { users, usersNew7d, volume24h, volumePrev24h, fees24h, openOrders, openOrdersBot, pendingKyc, pendingWithdrawals, oldestKycAt, oldestWithdrawalAt, volumeSeries } */
export const stats = () => get('/admin/stats');

/** -> { items: [AdminUser], page, total } */
export const users = ({ search, role, status, page, limit } = {}) => get('/admin/users', { search, role, status, page, limit });
/** -> { user, balances, recentOrders, recentTransactions } */
export const user = (id) => get(`/admin/users/${encodeURIComponent(id)}`);
/** -> { user } */
export const setUserStatus = (id, { status, reason }) => patch(`/admin/users/${encodeURIComponent(id)}/status`, { status, reason });
/** -> { user } */
export const setUserRole = (id, { role }) => patch(`/admin/users/${encodeURIComponent(id)}/role`, { role });

/** -> { items: [Kyc], page, total } */
export const kyc = ({ status, page, limit } = {}) => get('/admin/kyc', { status, page, limit });
/** The real endpoint streams the image; the mock answers { placeholder: true }. */
export const kycDocument = (id, image = 'document') => get(`/admin/kyc/${encodeURIComponent(id)}/document`, { image });
/** -> { application } */
export const decideKyc = (id, { decision, reason }) => patch(`/admin/kyc/${encodeURIComponent(id)}`, { decision, reason });

/** -> { items: [Transaction], page, total } */
export const withdrawals = ({ status, page, limit } = {}) => get('/admin/withdrawals', { status, page, limit });
/** -> { transaction } */
export const decideWithdrawal = (id, { decision, reason }) => patch(`/admin/withdrawals/${encodeURIComponent(id)}`, { decision, reason });

/** -> { markets: [Market] } */
export const markets = () => get('/admin/markets');
/** -> { market } (201) */
export const createMarket = (body) => post('/admin/markets', body);
/** -> { market } */
export const updateMarket = (symbol, body) => patch(`/admin/markets/${encodeURIComponent(symbol)}`, body);

/** -> { assets: [Asset] } */
export const assets = () => get('/admin/assets');
/** -> { items: [AuditLog], nextCursor } */
export const auditLogs = ({ action, actorId, cursor, limit } = {}) => get('/admin/audit-logs', { action, actorId, cursor, limit });
/** -> { checkedAt, mongo, redis, engine, apiInstances, sockets } */
export const systemHealth = () => get('/admin/system/health');
