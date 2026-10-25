// Checks the static demo data in client/src/models/data before it reaches the
// app: the envelope on every file, unique ids, every wallet against the sum of
// its ledger entries (and each entry's after-balances), locked funds against open
// orders and pending withdrawals, fills against their orders, decimals against
// tick, step and asset sizes, and the books' ordering. Exits 1 on any problem.
//
// Usage: npm run check:data

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'client', 'src', 'models', 'data');
const m = await import(pathToFileURL(join(root, 'client', 'src', 'models', 'domain', 'money.js')).href);

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);
let checks = 0;
const check = (ok, where, message) => {
  checks += 1;
  if (!ok) fail(where, message);
  return ok;
};

// ---------------------------------------------------------------- files and envelopes
const files = {};
for (const name of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
  try {
    const json = JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
    if (check(json?.success === true && json.data && typeof json.data === 'object', name, 'needs { success: true, data }')) {
      files[name] = json.data;
    }
  } catch (err) {
    fail(name, `invalid JSON (${err.message})`);
  }
}
const need = (name) => files[name] ?? (fail(name, 'missing'), null);

const assets = need('assets.json')?.assets ?? [];
const markets = need('markets.json')?.markets ?? [];
const users = need('users.json')?.items ?? [];
const orders = need('orders.json')?.items ?? [];
const fills = need('fills.json')?.items ?? [];
const ledger = need('ledger.json')?.items ?? [];
const balances = need('balances.json')?.items ?? [];
const transactions = need('transactions.json')?.items ?? [];
const kyc = need('kyc.json')?.items ?? [];
const sessions = need('sessions.json')?.items ?? [];
const audit = need('audit-logs.json')?.items ?? [];
const notifications = need('notifications.json')?.items ?? [];
const accounts = need('demo-accounts.json')?.accounts ?? [];

const assetBy = new Map(assets.map((a) => [a.code, a]));
const marketBy = new Map(markets.map((x) => [x.symbol, x]));
const userBy = new Map(users.map((u) => [u.id, u]));
const OBJECT_ID = /^[0-9a-f]{24}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

const decimalsOf = (asset) => assetBy.get(asset)?.decimals ?? 8;
const fits = (where, value, decimals) => check(m.isDecimal(value) && m.fitsDecimals(value, decimals), where, `${value} must have at most ${decimals} decimals`);
const time = (where, value) => check(typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(value)), where, `bad timestamp ${value}`);

function unique(name, items, key = 'id', pattern = OBJECT_ID) {
  const seen = new Set();
  for (const item of items) {
    const id = item[key];
    check(pattern.test(String(id)), name, `id ${id} isn't a 24-character hex id`);
    check(!seen.has(id), name, `duplicate id ${id}`);
    seen.add(id);
  }
}

// ---------------------------------------------------------------- ids
unique('users.json', users);
unique('orders.json', orders);
unique('fills.json', fills);
unique('ledger.json', ledger);
unique('transactions.json', transactions);
unique('kyc.json', kyc);
unique('sessions.json', sessions);
unique('audit-logs.json', audit);
unique('notifications.json', notifications);
const tradeIds = [];
for (const [name, data] of Object.entries(files)) {
  if (name.startsWith('trades.')) tradeIds.push(...data.trades);
}
unique('trades.*.json', tradeIds);

// ---------------------------------------------------------------- assets and markets
for (const a of assets) {
  for (const field of ['withdrawFee', 'minWithdraw', 'demoDepositLimit']) fits(`asset ${a.code}.${field}`, a[field], a.decimals);
  check(m.gt(a.minWithdraw, a.withdrawFee), `asset ${a.code}`, 'minWithdraw must be above the fee');
}
for (const x of markets) {
  const where = `market ${x.symbol}`;
  check(assetBy.has(x.baseAsset) && assetBy.has(x.quoteAsset), where, 'unknown asset');
  check(x.symbol === `${x.baseAsset}-${x.quoteAsset}`, where, 'symbol must be BASE-QUOTE');
  const t = x.ticker;
  for (const field of ['last', 'open', 'high', 'low']) check(m.fitsStep(t[field], x.tickSize), where, `ticker.${field} ${t[field]} breaks tickSize`);
  check(m.lte(t.low, t.last) && m.lte(t.last, t.high), where, 'last must sit between low and high');
  const change = m.pct(m.sub(t.last, t.open), t.open, 2);
  check(m.eq(change, t.changePct), where, `changePct ${t.changePct} doesn't match last/open (${change})`);
}

// ---------------------------------------------------------------- books and public trades
for (const x of markets) {
  const data = files[`orderbook.${x.symbol}.json`];
  if (!check(Boolean(data), `orderbook.${x.symbol}.json`, 'missing')) continue;
  const where = `orderbook.${x.symbol}.json`;
  for (const [side, list] of [['bids', data.bids], ['asks', data.asks]]) {
    list.forEach(([p, q], i) => {
      check(m.fitsStep(p, x.tickSize) && m.fitsStep(q, x.stepSize) && m.isPositive(q), where, `${side}[${i}] ${p} × ${q} breaks tick or step`);
      if (i > 0) {
        const ordered = side === 'bids' ? m.lt(p, list[i - 1][0]) : m.gt(p, list[i - 1][0]);
        check(ordered, where, `${side} must be sorted ${side === 'bids' ? 'high to low' : 'low to high'}`);
      }
    });
  }
  if (data.bids.length && data.asks.length) check(m.lt(data.bids[0][0], data.asks[0][0]), where, 'best bid must be below best ask');
  check(x.status !== 'halted' || (data.bids.length === 0 && data.asks.length === 0), where, 'a halted market has an empty book');

  // People's resting orders are part of the snapshot: each must fit inside its level.
  const resting = new Map();
  for (const o of orders) {
    if (o.market !== x.symbol || !['open', 'partially_filled'].includes(o.status)) continue;
    const key = `${o.side === 'buy' ? 'bids' : 'asks'}|${o.price}`;
    resting.set(key, m.add(resting.get(key) ?? '0', m.sub(o.quantity, o.filledQuantity)));
  }
  for (const [key, amount] of resting) {
    const [side, p] = key.split('|');
    const level = data[side].find(([lp]) => m.eq(lp, p));
    const lastShown = data[side][data[side].length - 1]?.[0];
    const beyond = lastShown && (side === 'bids' ? m.lt(p, lastShown) : m.gt(p, lastShown));
    check(beyond || (level && m.gte(level[1], amount)), where, `resting ${side} ${amount} at ${p} don't fit in the snapshot`);
  }

  const trades = files[`trades.${x.symbol}.json`]?.trades ?? [];
  trades.forEach((t, i) => {
    check(m.fitsStep(t.price, x.tickSize) && m.fitsStep(t.quantity, x.stepSize), `trades.${x.symbol}.json`, `trade ${t.id} breaks tick or step`);
    check(['buy', 'sell'].includes(t.takerSide), `trades.${x.symbol}.json`, `trade ${t.id} takerSide`);
    time(`trades.${x.symbol}.json`, t.time);
    if (i > 0) check(t.time <= trades[i - 1].time, `trades.${x.symbol}.json`, 'trades must be newest first');
  });
  if (trades.length) check(m.eq(trades[0].price, x.ticker.last), `trades.${x.symbol}.json`, 'the newest trade must equal ticker.last');
}

// ---------------------------------------------------------------- users, sessions, notifications, audit
const humans = users.filter((u) => !u.isBot);
check(files['users.json']?.total === humans.length, 'users.json', `total ${files['users.json']?.total} must count the ${humans.length} people`);
const emails = new Set();
for (const u of users) {
  check(!emails.has(u.email), 'users.json', `duplicate email ${u.email}`);
  emails.add(u.email);
  time(`user ${u.email}`, u.createdAt);
  if (u.lastLoginAt) check(u.lastLoginAt >= u.createdAt, `user ${u.email}`, 'last login before sign-up');
  check(['user', 'admin'].includes(u.role) && ['active', 'frozen'].includes(u.status), `user ${u.email}`, 'role or status');
  check(['none', 'pending', 'approved', 'rejected'].includes(u.kycStatus), `user ${u.email}`, 'kycStatus');
}
for (const a of accounts) check(users.some((u) => u.email === a.email), 'demo-accounts.json', `${a.email} has no user`);
for (const s of sessions) check(userBy.has(s.userId), 'sessions.json', `${s.id} has an unknown user`);
for (const n of notifications) check(userBy.has(n.userId) && !userBy.get(n.userId).isBot, 'notifications.json', `${n.id} must belong to a person`);
for (const entry of audit) time('audit-logs.json', entry.createdAt);

// ---------------------------------------------------------------- KYC
for (const app of kyc) {
  const u = userBy.get(app.userId);
  if (!check(Boolean(u), 'kyc.json', `${app.id} has an unknown user`)) continue;
  check(u.kycStatus === app.status, 'kyc.json', `${u.email} is ${u.kycStatus} but the application is ${app.status}`);
  check(app.userEmail === u.email && app.userDisplayName === u.displayName, 'kyc.json', `${app.id} user fields`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(app.dateOfBirth), 'kyc.json', `${app.id} dateOfBirth`);
  check(app.status !== 'rejected' || Boolean(app.rejectReason), 'kyc.json', `${app.id} rejected without a reason`);
  check(app.status === 'pending' ? app.reviewedAt == null : app.reviewedAt >= app.createdAt, 'kyc.json', `${app.id} review time`);
}
for (const u of humans) {
  if (u.kycStatus !== 'none') check(kyc.some((k) => k.userId === u.id), 'kyc.json', `${u.email} is ${u.kycStatus} with no application`);
}

// ---------------------------------------------------------------- the ledger against the wallets
const chains = new Map();
for (const e of ledger) {
  const where = `ledger ${e.id}`;
  check(userBy.has(e.userId) && !userBy.get(e.userId).isBot, where, 'must belong to a person');
  check(assetBy.has(e.asset), where, `unknown asset ${e.asset}`);
  time(where, e.time);
  for (const field of ['deltaAvailable', 'deltaLocked', 'availableAfter', 'lockedAfter']) fits(`${where}.${field}`, e[field], decimalsOf(e.asset));
  const key = `${e.userId}|${e.asset}`;
  if (!chains.has(key)) chains.set(key, []);
  chains.get(key).push(e);
}
const order = (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
const totals = new Map();
for (const [key, entries] of chains) {
  let available = '0';
  let locked = '0';
  for (const e of [...entries].sort(order)) {
    available = m.add(available, e.deltaAvailable);
    locked = m.add(locked, e.deltaLocked);
    check(m.eq(available, e.availableAfter) && m.eq(locked, e.lockedAfter), `ledger ${e.id}`, `after-balances ${e.availableAfter}/${e.lockedAfter} should be ${available}/${locked}`);
    check(!m.isNegative(available) && !m.isNegative(locked), `ledger ${e.id}`, 'balance goes negative');
  }
  totals.set(key, { available, locked });
}
const balanceKeys = new Set();
for (const b of balances) {
  const key = `${b.userId}|${b.asset}`;
  const where = `balance ${key}`;
  balanceKeys.add(key);
  for (const field of ['available', 'locked', 'total']) fits(`${where}.${field}`, b[field], decimalsOf(b.asset));
  check(m.eq(b.total, m.add(b.available, b.locked)), where, 'total must equal available + locked');
  const sum = totals.get(key) ?? { available: '0', locked: '0' };
  check(m.eq(b.available, sum.available) && m.eq(b.locked, sum.locked), where, `wallet ${b.available}/${b.locked} but the ledger adds up to ${sum.available}/${sum.locked}`);
}
for (const key of totals.keys()) check(balanceKeys.has(key), `balance ${key}`, 'ledger entries with no wallet');

// ---------------------------------------------------------------- orders, fills and locks
const OPEN = new Set(['pending', 'open', 'partially_filled']);
const fillsBy = new Map();
for (const f of fills) {
  check(orders.some((o) => o.id === f.orderId), `fill ${f.id}`, 'unknown order');
  if (!fillsBy.has(f.orderId)) fillsBy.set(f.orderId, []);
  fillsBy.get(f.orderId).push(f);
}
const expectedLocks = new Map();
const addLock = (userId, asset, amount) => {
  const key = `${userId}|${asset}`;
  expectedLocks.set(key, m.add(expectedLocks.get(key) ?? '0', amount));
};
for (const o of orders) {
  const where = `order ${o.id}`;
  const x = marketBy.get(o.market);
  if (!check(Boolean(x), where, `unknown market ${o.market}`)) continue;
  check(['pending', 'open', 'partially_filled', 'filled', 'cancelled', 'rejected'].includes(o.status), where, `status ${o.status}`);
  if (o.type === 'limit') {
    check(m.fitsStep(o.price, x.tickSize), where, `price ${o.price} breaks tickSize`);
    check(m.fitsStep(o.quantity, x.stepSize) && m.gte(o.quantity, x.minQty), where, `quantity ${o.quantity} breaks stepSize or minQty`);
    check(m.gte(m.mul(o.price, o.quantity), x.minNotional), where, 'below minNotional');
  }
  const own = fillsBy.get(o.id) ?? [];
  check(m.eq(o.filledQuantity, m.sum(own.map((f) => f.quantity))), where, 'filledQuantity must equal the sum of its fills');
  check(m.eq(o.executedQuote, m.sum(own.map((f) => f.quoteQuantity))), where, 'executedQuote must equal the sum of its fills');
  check(m.eq(o.fee, m.sum(own.map((f) => f.fee))), where, 'fee must equal the sum of its fills');
  if (o.quantity) check(m.lte(o.filledQuantity, o.quantity), where, 'overfilled');
  check(o.status !== 'pending' || o.appliedAt == null, where, 'a pending order has no appliedAt');
  check(o.status === 'pending' || o.appliedAt >= o.createdAt, where, 'appliedAt before createdAt');
  if (OPEN.has(o.status)) {
    const base = x.baseAsset;
    const remaining = o.quantity ? m.sub(o.quantity, o.filledQuantity) : null;
    if (o.side === 'sell') addLock(o.userId, base, remaining);
    else addLock(o.userId, x.quoteAsset, o.type === 'limit' ? m.mul(o.price, remaining) : m.sub(o.quoteQuantity, o.executedQuote));
  }
}
for (const t of transactions) {
  const where = `transaction ${t.id}`;
  check(userBy.has(t.userId), where, 'unknown user');
  check(new RegExp(`^sim-${t.asset.toLowerCase()}-[0-9a-f]{16}$`).test(t.address), where, `address ${t.address} isn't sim-${t.asset.toLowerCase()}- and 16 hex`);
  fits(`${where}.amount`, t.amount, decimalsOf(t.asset));
  if (t.type === 'withdrawal') {
    check(m.eq(t.receiveAmount, m.sub(t.amount, t.fee)), where, 'receiveAmount must be amount − fee');
    check(m.eq(t.fee, assetBy.get(t.asset).withdrawFee), where, 'fee must be the asset fee');
    if (t.status === 'pending') addLock(t.userId, t.asset, t.amount);
  }
  check(t.status !== 'completed' || Boolean(t.txHash), where, 'a completed transaction has a txHash');
}
for (const b of balances) {
  const key = `${b.userId}|${b.asset}`;
  const expected = expectedLocks.get(key) ?? '0';
  check(m.eq(b.locked, expected), `balance ${key}`, `locked ${b.locked} but open orders and pending withdrawals hold ${expected}`);
}

// ---------------------------------------------------------------- ledger references
const refs = { order: new Set(orders.map((o) => o.id)), trade: new Set(fills.map((f) => f.id)), transaction: new Set(transactions.map((t) => t.id)) };
for (const e of ledger) {
  if (e.refType === 'system') check(e.refId == null, `ledger ${e.id}`, 'system entries have no refId');
  else check(refs[e.refType]?.has(e.refId), `ledger ${e.id}`, `${e.refType} ${e.refId} doesn't exist`);
}

// ---------------------------------------------------------------- admin data
const series = need('admin-stats.json')?.volumeSeries ?? [];
series.forEach((d, i) => {
  if (i > 0) {
    const gap = (Date.parse(d.day) - Date.parse(series[i - 1].day)) / 86400000;
    check(gap === 1, 'admin-stats.json', `volumeSeries skips from ${series[i - 1].day} to ${d.day}`);
  }
});

// ---------------------------------------------------------------- report
if (problems.length) {
  console.error(`check:data found ${problems.length} problem(s) in ${checks} checks:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check:data: ${checks} checks passed on ${Object.keys(files).length} files.`);
