// How the demo data is made. buildSeed() reads the seed JSON in
// client/src/models/data and moves every timestamp forward by one offset, so
// the newest lands just before now and the gaps stay as the boards show them.
// seedDatabase() replaces the six MongoDB collections with it, through the
// models, so every document is validated on its way in. `npm run seed`
// (server/scripts/seed.js) does both.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { durationMs } from '../lib/util.js';
import { MODELS, toDocument } from './documents.js';

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'client', 'src', 'models', 'data');
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
export const VERSION = 1;

/** The parts of the working set that live in STORE_FILE; the rest is in MongoDB (documents.js, MODELS). */
export const FILE_KEYS = [
  'meta', 'assets', 'markets', 'transactions', 'kyc', 'audit', 'notifications', 'addresses', 'stats', 'health',
  'idempotency',
];

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

/**
 * Entries written at the same instant (a fill's debit, credit and fee) swap
 * ids among themselves so the ids ascend in the order they were written. New
 * entries get ascending ObjectIds anyway, so (time, _id) then sorts the whole
 * ledger as it was written.
 */
function orderTiedIds(ledger) {
  const groups = new Map();
  for (const entry of ledger) groups.set(entry.time, [...(groups.get(entry.time) ?? []), entry]);
  for (const tied of groups.values()) {
    const ids = tied.map((entry) => entry.id).sort();
    tied.forEach((entry, i) => { entry.id = ids[i]; });
  }
  return ledger;
}

/** A session from the seed file: live, and good for one refresh lifetime after its last use (section 3). */
const seedSession = ({ current, ...session }) => ({
  ...session,
  userAgent: null,
  tokenVersion: 0,
  rotatedAt: null,
  expiresAt: new Date(Date.parse(session.lastUsedAt) + durationMs(env.REFRESH_TOKEN_TTL)).toISOString(),
  revokedAt: null,
});

/** A fresh copy of the demo data, as the store's working set. */
export async function buildSeed() {
  const names = Object.keys(SEED_FILES);
  const loaded = await Promise.all(names.map((name) => readSeed(SEED_FILES[name])));
  const raw = Object.fromEntries(names.map((name, i) => [name, loaded[i]]));

  // Everything that happened on the boards' clock; markets carry no times.
  const timed = { ...raw };
  delete timed.markets;
  const boardNow = newestTime(timed);
  const offsetMs = Date.now() - 1500 - boardNow;
  const s = shiftTimes(timed, offsetMs);
  const watchlists = new Map(s.watchlists.items.map((w) => [w.userId, w.watchlist]));

  return {
    meta: { version: VERSION, seededAt: new Date().toISOString(), offsetMs, boardNow: new Date(boardNow).toISOString() },
    assets: raw.assets.assets,
    markets: raw.markets.markets.map(({ ticker, ...config }) => config),
    users: s.users.items.map((user) => ({ ...user, watchlist: watchlists.get(user.id) ?? [] })),
    balances: s.balances.items,
    ledger: orderTiedIds(s.ledger.items),
    orders: s.orders.items,
    fills: s.fills.items,
    transactions: s.transactions.items,
    kyc: s.kyc.items,
    sessions: s.sessions.items.map(seedSession),
    audit: s.audit.items,
    notifications: s.notifications.items,
    addresses: s.addresses.items,
    stats: s.stats,
    health: s.health,
    idempotency: {},
  };
}

/**
 * Empties the six collections and fills them from a seed, through the models,
 * so validation runs. The demo accounts' passwords and 2FA code are stored only
 * as bcrypt hashes. (insertMany runs no save hooks, so they are hashed here.)
 */
export async function seedDatabase(data) {
  const hash = (text) => bcrypt.hash(text, env.BCRYPT_ROUNDS);
  const { accounts } = await readSeed('demo-accounts.json');
  const users = await Promise.all(data.users.map(async (record) => {
    const doc = toDocument('users', record);
    const account = accounts.find((a) => a.email === record.email);
    if (account) doc.passwordHash = await hash(account.password);
    if (account?.twoFactorCode) doc.twoFactor.codeHash = await hash(account.twoFactorCode);
    return doc;
  }));

  for (const [collection, Model] of Object.entries(MODELS)) {
    const docs = collection === 'users' ? users : data[collection].map((record) => toDocument(collection, record));
    await Model.createIndexes();
    await Model.deleteMany({});
    await Model.insertMany(docs);
  }
}
