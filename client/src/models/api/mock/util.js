// Helpers the mock route handlers share: the two list styles of section 4
// (cursor feeds and page-number tables) and small body checks.

import { badRequest } from './errors.js';

export const newestFirst = (field = 'createdAt') => (a, b) => (a[field] < b[field] ? 1 : a[field] > b[field] ? -1 : 0);
export const oldestFirst = (field = 'createdAt') => (a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0);

/** `?cursor=&limit=` feeds: returns `{ items, nextCursor }` (limit at most 100). */
export function cursorPage(list, query, map = (x) => x) {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const start = Math.max(0, Number(query.cursor) || 0);
  const items = list.slice(start, start + limit).map(map);
  const next = start + limit < list.length ? String(start + limit) : null;
  return { items, nextCursor: next };
}

/** `?page=&limit=` admin tables: returns `{ items, page, total }`. */
export function numberedPage(list, query, map = (x) => x) {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const page = Math.max(1, Number(query.page) || 1);
  return { items: list.slice((page - 1) * limit, page * limit).map(map), page, total: list.length };
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body?.[f] == null || String(body[f]).trim() === '');
  if (missing.length) {
    throw badRequest('Some fields are missing.', Object.fromEntries(missing.map((f) => [f, 'required'])));
  }
}

export const lower = (s) => String(s ?? '').trim().toLowerCase();
