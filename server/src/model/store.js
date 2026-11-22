// The store: the server's working set of the demo data, kept in memory and
// saved to a JSON file (STORE_FILE) so it survives a restart. Moved from the
// mock's db.js, which kept it in the browser's localStorage.
//
// On the first start (or after a reset) it reads the seed JSON in
// client/src/models/data, moves every timestamp forward by one offset so the
// newest lands just before now (the gaps between them stay as the boards show
// them), and saves the result. Later starts load the saved file, so the demo
// data keeps ageing like a live account.
//
// Market data (tickers, books, public trades, candles) isn't saved here: the
// market simulator restarts it from the seed files each time the server starts.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'client', 'src', 'models', 'data');
const VERSION = 1;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const SEED_FILES = {
  assets: 'assets.json',
  markets: 'markets.json',
  users: 'users.json',
  balances: 'balances.json',
  ledger: 'ledger.json',
  orders: 'orders.json',
  fills: 'fills.json',
  transactions: 'transactions.json',
  kyc: 'kyc.json',
  sessions: 'sessions.json',
  audit: 'audit-logs.json',
  notifications: 'notifications.json',
  watchlists: 'watchlists.json',
  addresses: 'deposit-addresses.json',
  stats: 'admin-stats.json',
  health: 'system-health.json',
  accounts: 'demo-accounts.json',
};

/** One seed file's `data`; every seed file is a { success, data } envelope. */
export async function readSeed(file) {
  const json = JSON.parse(await readFile(join(SEED_DIR, file), 'utf8'));
  if (json?.success !== true) throw new Error(`${file} isn't a { success, data } envelope`);
  return json.data;
}

/** The latest ISO timestamp anywhere inside `value`, in ms. */
export function newestTime(value) {
  let latest = -Infinity;
  const walk = (v) => {
    if (typeof v === 'string') {
      if (ISO_TIME.test(v)) latest = Math.max(latest, Date.parse(v));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return latest;
}

/** A copy of `value` with every ISO timestamp moved by `ms`. */
export function shiftTimes(value, ms) {
  if (typeof value === 'string') return ISO_TIME.test(value) ? new Date(Date.parse(value) + ms).toISOString() : value;
  if (Array.isArray(value)) return value.map((v) => shiftTimes(v, ms));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftTimes(v, ms)]));
  }
  return value;
}

async function seed() {
  const names = Object.keys(SEED_FILES);
  const loaded = await Promise.all(names.map((name) => readSeed(SEED_FILES[name])));
  const raw = Object.fromEntries(names.map((name, i) => [name, loaded[i]]));

  // Everything that happened on the boards' clock; markets carry no times.
  const timed = { ...raw };
  delete timed.markets;
  const boardNow = newestTime(timed);
  const offsetMs = Date.now() - 1500 - boardNow;
  const s = shiftTimes(timed, offsetMs);

  return {
    meta: { version: VERSION, seededAt: new Date().toISOString(), offsetMs, boardNow: new Date(boardNow).toISOString() },
    assets: raw.assets.assets,
    markets: raw.markets.markets.map(({ ticker, ...config }) => config),
    users: s.users.items,
    credentials: Object.fromEntries(s.accounts.accounts.map((a) => [a.email, { password: a.password, twoFactorCode: a.twoFactorCode }])),
    balances: s.balances.items,
    ledger: s.ledger.items,
    orders: s.orders.items,
    fills: s.fills.items,
    transactions: s.transactions.items,
    kyc: s.kyc.items,
    sessions: s.sessions.items,
    audit: s.audit.items,
    notifications: s.notifications.items,
    watchlists: Object.fromEntries(s.watchlists.items.map((w) => [w.userId, w.watchlist])),
    addresses: s.addresses.items,
    stats: s.stats,
    health: s.health,
    lockouts: {},
    idempotency: {},
    refreshTokens: {}, // SHA-256 of an rt cookie's token -> session id (session.js)
  };
}

function readStored() {
  try {
    const stored = JSON.parse(readFileSync(env.STORE_FILE, 'utf8'));
    return stored?.meta?.version === VERSION ? stored : null;
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[store] ${env.STORE_FILE} couldn't be read (${err.message}), so the demo data starts again from the seed files`);
    return null;
  }
}

let data = null;
let saveTimer = null;

/** Loads the saved file, or seeds a fresh copy when there is none. */
export async function open() {
  if (data) return data;
  data = readStored() ?? (await seed());
  data.refreshTokens ??= {};
  saveNow();
  return data;
}

export function db() {
  if (!data) throw new Error('The store is not open yet');
  return data;
}

/** Saves soon: 200 ms after the last change, so a burst of changes is written once. */
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 200);
}

/**
 * Saves now. It writes a temporary file and then renames it over STORE_FILE,
 * so a crash halfway through never leaves half a file behind. A failed save
 * keeps the data in memory, and the next change tries again.
 */
export function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!data) return;
  try {
    mkdirSync(dirname(env.STORE_FILE), { recursive: true });
    const temp = `${env.STORE_FILE}.tmp`;
    writeFileSync(temp, JSON.stringify(data));
    renameSync(temp, env.STORE_FILE);
  } catch (err) {
    console.error(`[store] couldn't save ${env.STORE_FILE}: ${err.message}`);
  }
}

/** Throws the demo data away and seeds it again from the JSON files. */
export async function reset() {
  data = await seed();
  saveNow();
  return data;
}

let counter = 0;
/** A 24-character hex id, ObjectId-like: seconds, then noise and a counter. */
export function newId() {
  counter = (counter + 1) % 0xffffff;
  const seconds = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const noise = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${seconds}${noise}${counter.toString(16).padStart(6, '0')}`;
}

export function uuid() {
  return crypto.randomUUID();
}
