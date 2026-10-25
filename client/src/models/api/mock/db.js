// The mock backend's database. On the first visit (or after "Reset demo data")
// it fetches the seed JSON in ../../data, moves every timestamp forward by one
// offset so the newest lands just before now (the gaps between them stay as
// the boards show them), and saves the result to localStorage. Later visits
// load the saved copy, so the demo data keeps ageing like a live account.
//
// Market data (tickers, books, public trades, candles) isn't saved here: the
// market simulator restarts it from the seed files on each page load.

const STORAGE_KEY = 'orichal.demo.v1';
const DATA_URL = '/src/models/data/';
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

export async function fetchSeed(file) {
  const res = await fetch(`${DATA_URL}${file}`);
  if (!res.ok) throw new Error(`Couldn't load ${file} (${res.status})`);
  const json = await res.json();
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
  const loaded = await Promise.all(names.map((name) => fetchSeed(SEED_FILES[name])));
  const raw = Object.fromEntries(names.map((name, i) => [name, loaded[i]]));

  // Everything that happened on the boards' clock; markets carry no times.
  const timed = { ...raw };
  delete timed.markets;
  const boardNow = newestTime(timed);
  const offsetMs = Date.now() - 1500 - boardNow;
  const s = shiftTimes(timed, offsetMs);

  return {
    meta: { version: 1, seededAt: new Date().toISOString(), offsetMs, boardNow: new Date(boardNow).toISOString() },
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
  };
}

function readStored() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const stored = JSON.parse(text);
    return stored?.meta?.version === 1 ? stored : null;
  } catch {
    return null;
  }
}

let data = null;
let saveTimer = null;

export async function open() {
  if (data) return data;
  data = readStored() ?? (await seed());
  persistNow();
  addEventListener('pagehide', persistNow);
  return data;
}

export function db() {
  if (!data) throw new Error('The mock database is not open yet');
  return data;
}

/** Saves soon; several writes in a row are saved once. */
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 200);
}

function persistNow() {
  clearTimeout(saveTimer);
  if (!data) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked (private mode): the demo still runs from memory.
  }
}

/** Throws the saved demo data away and seeds it again from the JSON files. */
export async function reset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  data = await seed();
  persistNow();
  return data;
}

let counter = 0;
/** A 24-character hex id, ObjectId-like: seconds, then a counter and noise. */
export function newId() {
  counter = (counter + 1) % 0xffffff;
  const seconds = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const noise = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${seconds}${noise}${counter.toString(16).padStart(6, '0')}`;
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${newId()}-uuid`;
}
