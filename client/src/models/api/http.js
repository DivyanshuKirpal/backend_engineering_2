// Every API call goes through request(). It adds the access token (kept in
// memory, never in storage), unwraps the { success, data } envelope, turns
// { success: false, error } into an ApiError, and after a 401 refreshes once
// and retries, as section 6 flow E describes.
//
// Static phase: the transport is the mock server in ./mock. When the Express
// API exists, set TRANSPORT to fetchTransport and delete ./mock; nothing that
// calls these clients has to change.

import { handle as mockTransport } from './mock/server.js';

const API_BASE = '/api/v1';
const NO_REFRESH = new Set(['/auth/login', '/auth/login/2fa', '/auth/register', '/auth/refresh', '/auth/logout']);

export class ApiError extends Error {
  constructor(status, { code = 'INTERNAL', message = 'Something went wrong.', details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** The real backend: same request shape, sent with fetch(). */
export async function fetchTransport({ method, path, query, body, headers }) {
  const url = new URL(`${API_BASE}${path}`, location.origin);
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== '') url.searchParams.set(k, v);
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body == null ? undefined : isForm ? body : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body: json };
}

const TRANSPORT = mockTransport;

let accessToken = null;
let refreshing = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshToken() {
  refreshing ??= TRANSPORT({ method: 'POST', path: '/auth/refresh', headers: {} })
    .then((res) => {
      accessToken = res.body?.success ? res.body.data.accessToken : null;
      return accessToken;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Sends one request and resolves with the envelope's `data`.
 * Throws ApiError for error envelopes and for network failures (code NETWORK).
 */
export async function request(method, path, { query, body, headers = {} } = {}) {
  const send = () => TRANSPORT({
    method,
    path,
    query: query ? Object.fromEntries(Object.entries(query).filter(([, v]) => v != null && v !== '')) : {},
    body: body ?? null,
    headers: { ...headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
  });

  let res;
  try {
    res = await send();
    if (res.status === 401 && !NO_REFRESH.has(path) && (await refreshToken())) res = await send();
  } catch (err) {
    throw new ApiError(0, { code: 'NETWORK', message: 'The connection failed. Check it and try again.', details: { cause: String(err) } });
  }

  if (res.status === 204) return null;
  if (res.body?.success) return res.body.data;
  throw new ApiError(res.status, res.body?.error);
}

export const get = (path, query) => request('GET', path, { query });
export const post = (path, body, headers) => request('POST', path, { body, headers });
export const patch = (path, body) => request('PATCH', path, { body });
export const put = (path, body) => request('PUT', path, { body });
export const del = (path, query) => request('DELETE', path, { query });

/** A fresh key for POST /orders, deposits and withdrawals (section 4). */
export const idempotencyKey = () => crypto.randomUUID();
