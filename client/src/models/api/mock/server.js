// The mock backend's front door, standing in for the Express app and the
// Socket.IO gateway of sections 1 and 4. http.js sends every API call here
// instead of to /api/v1; when the real server exists, http.js points at it and
// this folder is deleted. Responses use the section 4 envelope:
// { success: true, data } or { success: false, error: { code, message, details } }.

import * as store from './db.js';
import { MockError } from './errors.js';
import * as market from './market.js';
import * as engine from './engine.js';
import * as session from './session.js';
import { listen } from './bus.js';
import auth from './routes/auth.js';
import users from './routes/users.js';
import markets from './routes/markets.js';
import orders from './routes/orders.js';
import walletRoutes from './routes/wallet.js';
import kyc from './routes/kyc.js';
import notifications from './routes/notifications.js';
import admin from './routes/admin.js';

const routes = [...auth, ...users, ...markets, ...orders, ...walletRoutes, ...kyc, ...notifications, ...admin].map(([method, path, handler]) => {
  const names = [];
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  })}$`);
  return { method, pattern, names, handler };
});

// Fake network: reads are quick, writes a little slower, so loading states show.
const latency = { GET: [140, 380], WRITE: [220, 520] };
const settings = { failNext: false, slow: false };

let ready = null;
async function boot() {
  await store.open();
  await market.init();
  market.start();
  engine.replayPending();
}
export function whenReady() {
  ready ??= boot();
  return ready;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Handles one API request: { method, path, query, body, headers } -> { status, body }. */
export async function handle({ method, path, query = {}, body = null, headers = {} }) {
  await whenReady();
  const [lo, hi] = method === 'GET' ? latency.GET : latency.WRITE;
  await sleep((lo + Math.random() * (hi - lo)) * (settings.slow ? 4 : 1));

  if (settings.failNext) {
    settings.failNext = false;
    return { status: 503, body: { success: false, error: { code: 'INTERNAL', message: 'The demo failed this request on purpose. Try again.' } } };
  }

  const route = routes.find((r) => r.method === method && r.pattern.test(path));
  if (!route) return { status: 404, body: { success: false, error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } } };
  const values = route.pattern.exec(path).slice(1).map(decodeURIComponent);
  const params = Object.fromEntries(route.names.map((n, i) => [n, values[i]]));
  const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const who = session.fromHeader(lowerHeaders);
  const parsedBody = body instanceof FormData ? Object.fromEntries(body.entries()) : body;

  try {
    const { status = 200, data } = await route.handler({
      method, path, params, query, body: parsedBody, headers: lowerHeaders,
      user: who?.user ?? null, session: who?.session ?? null,
    });
    return { status, body: status === 204 ? null : { success: true, data } };
  } catch (err) {
    if (err instanceof MockError) {
      return { status: err.status, body: { success: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } } };
    }
    console.error('[mock server]', method, path, err);
    return { status: 500, body: { success: false, error: { code: 'INTERNAL', message: 'Something went wrong in the demo server.' } } };
  }
}

// ---------------------------------------------------------------- the socket gateway
const PUBLIC_ROOM = /^(tickers|market:[A-Z]+-[A-Z]+|candles:[A-Z]+-[A-Z]+:(1m|5m|15m|1h|4h|1d))$/;

/**
 * Opens a socket connection. Public rooms are joined by name; a valid access
 * token also joins the private `user:{id}` room, which can't be joined by name.
 */
export async function connect({ token, onEvent }) {
  await whenReady();
  const rooms = new Map();
  const deliver = (event, payload) => onEvent(event, payload);
  const who = token ? session.fromHeader({ authorization: `Bearer ${token}` }) : null;
  if (who) rooms.set(`user:${who.user.id}`, listen(`user:${who.user.id}`, deliver));
  return {
    join(room) {
      if (!PUBLIC_ROOM.test(room)) return false;
      if (!rooms.has(room)) rooms.set(room, listen(room, deliver));
      return true;
    },
    leave(room) {
      if (room.startsWith('user:')) return;
      rooms.get(room)?.();
      rooms.delete(room);
    },
    close() {
      for (const off of rooms.values()) off();
      rooms.clear();
    },
  };
}

// ---------------------------------------------------------------- demo controls
export function failNextRequest() {
  settings.failNext = true;
}

export function setSlowNetwork(on) {
  settings.slow = Boolean(on);
}

/** Throws the demo data away and loads it again from the seed files. */
export async function resetDemo() {
  await whenReady();
  market.clear();
  session.clearCookie();
  await store.reset();
  await market.init();
  market.start();
  engine.replayPending();
}
