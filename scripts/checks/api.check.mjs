// Calls the API over HTTP from Node, as Postman would, and checks that its
// money stays consistent: sign-in with 2FA and the rt cookie, refresh and
// logout, orders that rest, fill and cancel, the market rules, a deposit and a
// withdrawal, an admin's approval, and the ledger after each. In the static
// phase this file drove the mock backend inside the page (mock.check.mjs).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as money from '../../client/src/models/domain/money.js';
import { start } from './harness.mjs';

const { base, check, fail, finish, snapshot, runScript, dataDir } = await start({ browser: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One client, as a browser would be: its cookies (sent only under their path) and its access token. */
function client() {
  const cookies = new Map(); // name -> { value, path }
  let token = null;
  return {
    cookies,
    setToken(t) { token = t; },
    async call(method, path, body, query = {}, headers = {}) {
      const url = new URL(`/api/v1${path}`, base);
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
      const sent = [...cookies].filter(([, c]) => url.pathname.startsWith(c.path)).map(([name, c]) => `${name}=${c.value}`);
      const res = await fetch(url, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(sent.length ? { Cookie: sent.join('; ') } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.getSetCookie();
      for (const line of setCookie) {
        const [pair, ...attributes] = line.split(';').map((part) => part.trim());
        const name = pair.slice(0, pair.indexOf('='));
        const value = pair.slice(pair.indexOf('=') + 1);
        const cookiePath = attributes.find((a) => /^path=/i.test(a))?.slice(5) ?? '/';
        if (!value || /^expires=thu, 01 jan 1970/i.test(attributes.find((a) => /^expires=/i.test(a)) ?? '')) cookies.delete(name);
        else cookies.set(name, { value, path: cookiePath });
      }
      return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null), setCookie };
    },
  };
}

try {
  const demo = client();
  const call = (...args) => demo.call(...args);
  let r = await call('POST', '/demo/reset');
  check('the demo data resets', r.status === 200);
  let script = runScript('check-ledger.js');
  check('db:check-ledger on the seeded data', script.status === 0 && /All 59 wallets/.test(script.stdout), script.stdout);
  script = runScript('explain.js');
  check('db:explain on the seeded data: the compound indexes, nothing extra examined', script.status === 0, script.stdout);

  // Ledger consistency for the signed-in user
  const consistent = async (label) => {
    const bal = (await call('GET', '/wallet/balances')).body.data.balances;
    const led = (await call('GET', '/wallet/ledger', null, { limit: 100 })).body.data;
    let all = led.items;
    let cursor = led.nextCursor;
    while (cursor) {
      const more = (await call('GET', '/wallet/ledger', null, { limit: 100, cursor })).body.data;
      all = all.concat(more.items);
      cursor = more.nextCursor;
    }
    const bad = [];
    for (const b of bal) {
      const entries = all.filter((e) => e.asset === b.asset);
      const a = money.sum(entries.map((e) => e.deltaAvailable));
      const l = money.sum(entries.map((e) => e.deltaLocked));
      if (!money.eq(a, b.available) || !money.eq(l, b.locked)) bad.push(`${b.asset}: wallet ${b.available}/${b.locked} ledger ${a}/${l}`);
      const newest = entries[0];
      if (newest && (!money.eq(newest.availableAfter, b.available) || !money.eq(newest.lockedAfter, b.locked))) bad.push(`${b.asset}: newest after ${newest.availableAfter}/${newest.lockedAfter}`);
    }
    check(`ledger = wallet ${label}`, bad.length === 0, bad.join('; '));
    return bal;
  };

  // 1. Login with 2FA, and the rt cookie
  r = await call('POST', '/auth/login', { email: 'demo@orichal.app', password: 'wrong' });
  check('wrong password is 401', r.status === 401 && r.body.error.code === 'UNAUTHENTICATED');
  r = await call('POST', '/auth/login', { email: 'demo@orichal.app', password: 'orichal-demo' });
  check('2FA asked, no cookie yet', r.body.data?.requires2fa === true && r.setCookie.length === 0);
  const ticket = r.body.data.loginTicket;
  r = await call('POST', '/auth/login/2fa', { loginTicket: ticket, code: '000000' });
  check('wrong code shows tries left', r.status === 400 && r.body.error.details.attemptsLeft === 4, JSON.stringify(r.body.error));
  r = await call('POST', '/auth/login/2fa', { loginTicket: ticket, code: '123456' });
  check('2FA login', r.status === 200 && r.body.data.user.email === 'demo@orichal.app');
  const rt = r.setCookie.find((c) => c.startsWith('rt='));
  check('rt cookie: httpOnly, SameSite=Strict, only for /api/v1/auth, 7 days', /HttpOnly/i.test(rt) && /SameSite=Strict/i.test(rt) && /Path=\/api\/v1\/auth/i.test(rt) && /Max-Age=604800/i.test(rt), rt);
  demo.setToken(r.body.data.accessToken);
  const firstToken = r.body.data.accessToken;

  r = await client().call('GET', '/users/me');
  check('no token: 401', r.status === 401);
  const firstCookie = demo.cookies.get('rt').value;
  r = await call('POST', '/auth/refresh');
  check('refresh with the cookie: a new access token, and a new cookie', r.status === 200 && r.body.data.accessToken && demo.cookies.get('rt').value !== firstCookie);
  const payload = JSON.parse(Buffer.from(firstToken.split('.')[1], 'base64url'));
  check('the access token is a JWT with sub, role, sid and 15 minutes', payload.sub === '66f19a3c5e7b2d4f8a1c0e01' && payload.role === 'user' && /^[0-9a-f]{24}$/.test(payload.sid) && payload.exp - payload.iat === 900, JSON.stringify(payload));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const [head, , signature] = firstToken.split('.');
  const forged = [`${head}.${b64({ ...payload, role: 'admin', sub: '66e8d47b2c9f5a1e3d6b0a12' })}.${signature}`, `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`, firstCookie];
  const answers = [];
  for (const token of forged) answers.push((await fetch(`${base}/api/v1/users/me`, { headers: { Authorization: `Bearer ${token}` } })).status);
  check('a changed payload, alg none, and a refresh token as an access token: 401', answers.join() === '401,401,401', answers.join());
  const privately = await fetch(`${base}/api/v1/users/me`, { headers: { Authorization: `Bearer ${firstToken}` } });
  const publicly = await fetch(`${base}/api/v1/markets`);
  check('private answers are no-store, public ones are not', privately.headers.get('cache-control') === 'no-store' && publicly.headers.get('cache-control') !== 'no-store', `${privately.headers.get('cache-control')} ${publicly.headers.get('cache-control')}`);
  const expired = await fetch(`${base}/api/v1/markets`, { headers: { Authorization: 'Bearer not-a-token' } });
  check('a bad token on a public route is just a guest', expired.status === 200);
  r = await client().call('POST', '/auth/refresh');
  check('refresh without the cookie: 401', r.status === 401);

  let bal = await consistent('after login');
  const usdt = () => bal.find((b) => b.asset === 'USDT');
  check('USDT free 1616.000800', usdt().available === '1616.000800', usdt().available);

  // 2. Pending order turns open (replayed at start-up)
  await sleep(1600);
  r = await call('GET', '/orders', null, { state: 'open' });
  const a91c = r.body.data.items.find((o) => o.id.endsWith('a91c'));
  check('seeded pending order applied', a91c?.status === 'open' && a91c.appliedAt != null, a91c?.status);

  // 3. A buy that crosses the book fills now as a taker. The limit sits 50 USDT
  // over the best ask: in the second before the engine applies it, the
  // simulator can move the ask, or its bot can take the top level, by more
  // than a few USDT, but not by 50.
  const book = (await call('GET', '/markets/BTC-USDT/orderbook', null, { depth: 5 })).body.data;
  check('book has seq', typeof book.seq === 'number', String(book.seq));
  const limit = money.add(book.asks[0][0], '50');
  r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: limit, quantity: '0.001' }, {}, { 'Idempotency-Key': 'smoke-1' });
  check('order accepted 202 pending', r.status === 202 && r.body.data.order.status === 'pending', `${r.status} ${JSON.stringify(r.body.error ?? '')}`);
  const id1 = r.body.data.order.id;
  const again = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: limit, quantity: '0.001' }, {}, { 'Idempotency-Key': 'smoke-1' });
  check('same Idempotency-Key returns the same order', again.body.data.order.id === id1);
  await sleep(1000);
  r = await call('GET', `/orders/${id1}`);
  check('crossing order filled', r.body.data.order.status === 'filled', r.body.data.order.status);
  check('fill at resting price (taker)', r.body.data.fills[0]?.role === 'taker' && money.lt(r.body.data.fills[0].price, limit), JSON.stringify(r.body.data.fills[0]));
  check('order ledger has lock, debit, credit, fee, unlock', ['order_lock', 'trade_debit', 'trade_credit', 'trade_fee', 'order_unlock'].every((t) => r.body.data.ledger.some((e) => e.type === t)), r.body.data.ledger.map((e) => e.type).join(','));
  bal = await consistent('after taker fill');

  // 4. A resting buy, then cancel
  r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '61000.00', quantity: '0.002' });
  const id2 = r.body.data.order.id;
  await sleep(1000);
  r = await call('GET', `/orders/${id2}`);
  check('resting order is open', r.body.data.order.status === 'open', r.body.data.order.status);
  const snap = (await call('GET', '/markets/BTC-USDT/orderbook', null, { depth: 100 })).body.data;
  check('resting order on the book', snap.bids.some(([p]) => p === '61000.00'));
  r = await call('DELETE', `/orders/${id2}`);
  check('cancel 202', r.status === 202);
  await sleep(800);
  r = await call('GET', `/orders/${id2}`);
  check('cancelled with reason user', r.body.data.order.status === 'cancelled' && r.body.data.order.cancelReason === 'user');
  bal = await consistent('after cancel');

  // 5. Rules
  r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '62140.505', quantity: '0.01' });
  check('tick rule 422 MARKET_RULES', r.status === 422 && r.body.error.code === 'MARKET_RULES');
  r = await call('POST', '/orders', { market: 'BNB-USDT', side: 'buy', type: 'limit', price: '588.00', quantity: '0.1' });
  check('halted market 409', r.status === 409 && r.body.error.code === 'MARKET_HALTED');
  r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '62000.00', quantity: '1' });
  check('insufficient balance 422', r.status === 422 && r.body.error.code === 'INSUFFICIENT_BALANCE');

  // 6. Market buy by quote
  r = await call('POST', '/orders', { market: 'SOL-USDT', side: 'buy', type: 'market', quoteQuantity: '50' });
  const id3 = r.body.data.order.id;
  await sleep(1000);
  r = await call('GET', `/orders/${id3}`);
  check('market buy filled', r.body.data.order.status === 'filled', `${r.body.data.order.status} filled ${r.body.data.order.filledQuantity}`);
  bal = await consistent('after market buy');

  // 7. Deposit and withdrawal
  r = await call('POST', '/wallet/deposits', { asset: 'BTC', amount: '0.25' });
  check('deposit 201 completed', r.status === 201 && r.body.data.transaction.status === 'completed');
  r = await call('POST', '/wallet/deposits', { asset: 'BTC', amount: '2' });
  check('deposit over limit 400', r.status === 400);
  r = await call('POST', '/wallet/withdrawals', { asset: 'USDT', amount: '500', address: 'sim-usdt-c41e09ab77d2f310', code: '123456' });
  check('withdrawal 201 pending', r.status === 201 && r.body.data.transaction.status === 'pending' && r.body.data.transaction.receiveAmount === '499.000000', JSON.stringify(r.body.error ?? r.body.data.transaction.receiveAmount));
  const wid = r.body.data.transaction.id;
  r = await call('POST', '/wallet/withdrawals', { asset: 'USDT', amount: '20', address: 'bad-address', code: '123456' });
  check('bad address 400', r.status === 400);
  r = await call('POST', '/wallet/withdrawals', { asset: 'USDT', amount: '20', address: 'sim-usdt-c41e09ab77d2f310', code: '111111' });
  check('wrong 2FA code 400', r.status === 400 && r.body.error.code === 'INVALID_2FA_CODE');
  bal = await consistent('after deposit and withdrawal');

  // 8. Logout ends the session; the admin approves
  r = await call('POST', '/auth/logout');
  check('logout 204, the cookie cleared', r.status === 204 && !demo.cookies.has('rt') && r.setCookie.some((c) => c.startsWith('rt=;')));
  r = await call('POST', '/auth/refresh');
  check('refresh after logout: 401', r.status === 401);
  r = await call('GET', '/users/me');
  check('the old access token stopped working', r.status === 401);
  const admin = client();
  r = await admin.call('POST', '/auth/login', { email: 'admin@orichal.app', password: 'orichal-demo' });
  admin.setToken(r.body.data.accessToken);
  check('admin login without 2FA', r.status === 200 && r.body.data.user.role === 'admin');
  r = await admin.call('GET', '/admin/stats');
  check('stats: 54 users, 6 new, 7 KYC, 4 withdrawals', r.body.data.users === 54 && r.body.data.usersNew7d === 6 && r.body.data.pendingKyc === 7 && r.body.data.pendingWithdrawals === 4, JSON.stringify({ u: r.body.data.users, n: r.body.data.usersNew7d, k: r.body.data.pendingKyc, w: r.body.data.pendingWithdrawals }));
  r = await admin.call('PATCH', `/admin/withdrawals/${wid}`, { decision: 'approve' });
  check('withdrawal approved', r.body.data?.transaction.status === 'completed', JSON.stringify(r.body.error ?? ''));
  r = await admin.call('GET', '/admin/users', null, { page: 1 });
  check('users page 1 of 54, demo first', r.body.data.total === 54 && r.body.data.items[0].email === 'demo@orichal.app');
  r = await admin.call('GET', '/admin/system/health');
  check('health has 4 markets', r.body.data.engine.markets.length === 4);
  r = await call('GET', '/admin/stats');
  check('the trader is not an admin: 401 once signed out', r.status === 401);

  // 9. Back as demo: the ledger still adds up after the approval
  r = await call('POST', '/auth/login', { email: 'demo@orichal.app', password: 'orichal-demo' });
  r = await call('POST', '/auth/login/2fa', { loginTicket: r.body.data.loginTicket, code: '123456' });
  demo.setToken(r.body.data.accessToken);
  r = await call('GET', '/admin/stats');
  check('a trader on an admin route: 403 FORBIDDEN', r.status === 403 && r.body.error.code === 'FORBIDDEN');
  await consistent('after admin approval');

  // 10. One session per login
  const phone = client();
  r = await phone.call('POST', '/auth/login', { email: 'demo@orichal.app', password: 'orichal-demo' });
  r = await phone.call('POST', '/auth/login/2fa', { loginTicket: r.body.data.loginTicket, code: '123456' });
  const phoneTicket = r.status;
  phone.setToken(r.body.data.accessToken);
  const currentOf = async (c) => (await c.call('GET', '/users/me/sessions')).body.data.sessions.find((s) => s.current)?.id;
  const [mine, theirs] = [await currentOf(demo), await currentOf(phone)];
  check('two logins have two sessions', phoneTicket === 200 && mine && theirs && mine !== theirs, `${mine} ${theirs}`);
  r = await demo.call('DELETE', `/users/me/sessions/${theirs}`);
  check('signing the other device out ends only its session', r.status === 204 && (await phone.call('GET', '/users/me')).status === 401 && (await phone.call('POST', '/auth/refresh')).status === 401 && (await demo.call('GET', '/users/me')).status === 200);
  const sessionsBefore = (await demo.call('GET', '/users/me/sessions')).body.data.sessions.length;
  r = await demo.call('POST', '/auth/login', { email: 'demo@orichal.app', password: 'orichal-demo' });
  const usedTicket = r.body.data.loginTicket;
  r = await demo.call('POST', '/auth/login/2fa', { loginTicket: usedTicket, code: '123456' });
  demo.setToken(r.body.data.accessToken);
  check('logging in again in one browser replaces its session', (await demo.call('GET', '/users/me/sessions')).body.data.sessions.length === sessionsBefore && (await currentOf(demo)) !== mine);
  r = await client().call('POST', '/auth/login/2fa', { loginTicket: usedTicket, code: '123456' });
  check('a login ticket works once', r.status === 401);

  // 10b. Rotation and reuse detection
  const tab = client();
  r = await tab.call('POST', '/auth/login', { email: 'admin@orichal.app', password: 'orichal-demo' });
  tab.setToken(r.body.data.accessToken);
  const sid = await currentOf(tab);
  const version = async () => (await snapshot('sessions')).sessions.find((s) => s.id === sid).tokenVersion;
  const v0 = tab.cookies.get('rt');
  r = await tab.call('POST', '/auth/refresh');
  const v1 = tab.cookies.get('rt');
  check('a refresh raises the session\'s tokenVersion', r.status === 200 && (await version()) === 1);
  const twoTabs = client();
  twoTabs.cookies.set('rt', v0);
  r = await twoTabs.call('POST', '/auth/refresh');
  check('the version before, within 30 s: the current one, without rotating again', r.status === 200 && (await version()) === 1);
  tab.cookies.set('rt', v1);
  const together = client();
  together.cookies.set('rt', v1);
  const both = await Promise.all([tab.call('POST', '/auth/refresh'), together.call('POST', '/auth/refresh')]);
  check('two refreshes at the same moment both succeed and rotate once', both.map((x) => x.status).join() === '200,200' && (await version()) === 2, `${both.map((x) => x.status).join()} v${await version()}`);
  const thief = client();
  thief.cookies.set('rt', v0);
  r = await thief.call('POST', '/auth/refresh');
  check('a token two versions old: 401, its cookie cleared', r.status === 401 && !thief.cookies.has('rt'));
  check('and its session is over for the owner as well', (await tab.call('GET', '/users/me')).status === 401 && (await tab.call('POST', '/auth/refresh')).status === 401);
  check('the reuse is in the audit log', (await snapshot('audit')).audit.some((a) => a.action === 'auth.refresh_reused'));

  // 10c. A role or status change applies to tokens already handed out
  const boss = client();
  r = await boss.call('POST', '/auth/login', { email: 'admin@orichal.app', password: 'orichal-demo' });
  boss.setToken(r.body.data.accessToken);
  const DEMO = '66f19a3c5e7b2d4f8a1c0e01';
  check('the trader on an admin route: 403', (await demo.call('GET', '/admin/stats')).status === 403);
  await boss.call('PATCH', `/admin/users/${DEMO}/role`, { role: 'admin' });
  check('made an admin: the same token now reaches it', (await demo.call('GET', '/admin/stats')).status === 200);
  await boss.call('PATCH', `/admin/users/${DEMO}/role`, { role: 'user' });
  check('and a user again: 403', (await demo.call('GET', '/admin/stats')).status === 403);
  await boss.call('PATCH', `/admin/users/${DEMO}/status`, { status: 'frozen', reason: 'Check' });
  r = await demo.call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '60000.00', quantity: '0.001' });
  check('frozen: can look, but an order is 403 FORBIDDEN', r.status === 403 && r.body.error.code === 'FORBIDDEN' && (await demo.call('GET', '/wallet/balances')).status === 200);
  await boss.call('PATCH', `/admin/users/${DEMO}/status`, { status: 'active' });
  r = await client().call('GET', '/admin/stats');
  check('no token on an admin route: 401', r.status === 401);
  r = await client().call('GET', '/wallet/nothing-here');
  check('a guest on a private group gets 401 before any 404', r.status === 401);

  // 10d. Keyset pages: no gaps and no repeats, even with new orders arriving in between
  const placed = [];
  for (let i = 0; i < 6; i += 1) {
    const batch = await Promise.all([0, 1, 2, 3, 4].map((j) => demo.call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: `500${i}${j}.00`, quantity: '0.00020' })));
    placed.push(...batch.map((x) => x.body.data?.order.id));
  }
  check('30 more orders placed', placed.length === 30 && placed.every(Boolean), JSON.stringify(placed.slice(0, 2)));
  await sleep(1200);
  const whole = (await demo.call('GET', '/orders', null, { state: 'open', limit: 100 })).body.data.items.map((o) => o.id);
  check('one page of 100 has them all, newest first', placed.every((id) => whole.includes(id)) && whole.length >= 30, String(whole.length));
  const seen = [];
  let next = null;
  let pages = 0;
  do {
    r = await demo.call('GET', '/orders', null, { state: 'open', limit: 7, ...(next ? { cursor: next } : {}) });
    seen.push(...r.body.data.items.map((o) => o.id));
    next = r.body.data.nextCursor;
    pages += 1;
    // A new order on top of the list would push an offset down by one
    if (pages <= 3) await demo.call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: `4900${pages}.00`, quantity: '0.00020' });
  } while (next && pages < 20);
  check(`pages of 7: the same orders in the same order, in ${pages} pages`, seen.join() === whole.join(), `${seen.length} of ${whole.length}, ${new Set(seen).size} different`);
  await demo.call('DELETE', '/orders', null, { market: 'BTC-USDT' });
  await sleep(1500);
  const closed = [];
  next = null;
  do {
    r = await demo.call('GET', '/orders', null, { state: 'history', limit: 9, ...(next ? { cursor: next } : {}) });
    closed.push(...r.body.data.items);
    next = r.body.data.nextCursor;
  } while (next && closed.length < 200);
  check('History pages the cancelled ones without gaps or repeats', new Set(closed.map((o) => o.id)).size === closed.length && placed.every((id) => closed.some((o) => o.id === id && o.status === 'cancelled')) && closed.every((o, i) => i === 0 || closed[i - 1].createdAt >= o.createdAt), String(closed.length));
  r = await demo.call('GET', '/orders', null, { state: 'history', market: 'SOL-USDT', side: 'buy', limit: 100 });
  check('filters by market and side', r.body.data.items.length > 0 && r.body.data.items.every((o) => o.market === 'SOL-USDT' && o.side === 'buy'));
  r = await demo.call('GET', '/trades', null, { limit: 2 });
  const trades = [...r.body.data.items];
  while (r.body.data.nextCursor) trades.push(...(r = await demo.call('GET', '/trades', null, { limit: 2, cursor: r.body.data.nextCursor })).body.data.items);
  const allTrades = (await demo.call('GET', '/trades', null, { limit: 100 })).body.data.items;
  check(`trades page by 2: ${trades.length}, the same as one page`, trades.length > 3 && JSON.stringify(trades) === JSON.stringify(allTrades), `${trades.length} ${allTrades.length}`);
  r = await demo.call('GET', `/orders/${id1}`);
  check('one order with its fills and ledger, in the order written', r.body.data.fills.length >= 1 && r.body.data.fills[0].orderId === id1 && r.body.data.ledger.map((e) => e.type).join().startsWith('order_lock,trade_debit,trade_credit,trade_fee'), r.body.data.ledger.map((e) => e.type).join());
  const foreign = (await snapshot('orders')).orders.find((o) => o.userId !== DEMO).id;
  const notFound = [];
  for (const id of ['abc', '000000000000000000000000', foreign, '%24ne', 'a'.repeat(300)]) notFound.push((await demo.call('GET', `/orders/${id}`)).status);
  check('a malformed, unknown or somebody else\'s order id: 404', notFound.every((x) => x === 404), notFound.join());
  r = await demo.call('GET', '/orders/abc');
  check('the malformed one through Mongoose\'s CastError', r.body.error.code === 'NOT_FOUND' && r.body.error.message === 'Not found.', JSON.stringify(r.body));
  r = await demo.call('GET', '/orders', null, { cursor: 'not-a-cursor' });
  check('a broken cursor: 400', r.status === 400 && r.body.error.details.cursor === 'format', JSON.stringify(r.body));

  // 11. Register, the duplicate email, and the lockout
  const newcomer = client();
  r = await newcomer.call('POST', '/auth/register', { email: 'New.Person@Example.com', password: 'Correct-horse-42', displayName: 'New Person' });
  check('register 201 with an rt cookie', r.status === 201 && r.body.data.user.email === 'new.person@example.com' && newcomer.cookies.has('rt'), JSON.stringify(r.body));
  check('the answer holds no password or hash', !/password(Hash)?"|\$2[aby]\$|Correct-horse/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  newcomer.setToken(r.body.data.accessToken);
  const newId = r.body.data.user.id;
  r = await newcomer.call('GET', '/wallet/balances');
  check('with a 10,000 USDT wallet', r.body.data.balances.find((b) => b.asset === 'USDT').available === '10000.000000', JSON.stringify(r.body.data.balances[0]));
  r = await client().call('POST', '/auth/register', { email: 'new.person@example.com', password: 'Another-horse-43', displayName: 'Someone Else' });
  check('the same email again: 409 CONFLICT', r.status === 409 && r.body.error.code === 'CONFLICT' && r.body.error.details.email === 'taken', JSON.stringify(r.body));
  const twins = await Promise.all([1, 2, 3].map(() => client().call('POST', '/auth/register', { email: 'twin@example.com', password: 'Correct-horse-42', displayName: 'Twin' })));
  check('three at the same moment with one email: one 201, two 409', twins.map((t) => t.status).sort().join() === '201,409,409', twins.map((t) => t.status).join());
  r = await client().call('POST', '/auth/register', { email: 'long@example.com', password: `Aa1-${'x'.repeat(80)}`, displayName: 'Long' });
  check('a password longer than bcrypt reads: 400', r.status === 400 && r.body.error.details.password === 'long', JSON.stringify(r.body));
  const statuses = [];
  for (let i = 0; i < 5; i += 1) statuses.push((r = await client().call('POST', '/auth/login', { email: 'new.person@example.com', password: `wrong-${i}` })).status);
  check('five wrong passwords: four 401s, then 423 with lockUntil', statuses.join() === '401,401,401,401,423' && r.body.error.code === 'ACCOUNT_LOCKED' && Date.parse(r.body.error.details.lockUntil) > Date.now(), statuses.join());
  r = await client().call('POST', '/auth/login', { email: 'new.person@example.com', password: 'Correct-horse-42' });
  check('the right password while locked: 423', r.status === 423);
  check('a signed-in session goes on through the lock', (await newcomer.call('GET', '/users/me')).status === 200);
  r = await client().call('POST', '/auth/login', { email: 'nobody@example.com', password: 'whatever-1' });
  check('an unknown email answers like a wrong password', r.status === 401 && r.body.error.message === 'That email and password don\'t match an account.');
  // 12. Validation: one detail per field, whatever else is wrong
  const refused = async (label, [method, path, body, query], details, status = 400) => {
    const res = await demo.call(method, path, body, query);
    check(label, res.status === status && JSON.stringify(res.body.error.details ?? null) === JSON.stringify(details), `${res.status} ${JSON.stringify(res.body.error)}`);
    return res;
  };
  const before = (await snapshot('orders')).orders.length;
  r = await refused('an order with an unknown market, a negative amount and no price', ['POST', '/orders', { market: 'DOGE-INR', side: 'buy', type: 'limit', quantity: '-1' }], { market: 'unknown', quantity: 'positive', price: 'required' });
  check('   says what is wrong with the first field', r.body.error.code === 'VALIDATION_ERROR' && r.body.error.message === 'That market doesn\'t exist.', r.body.error.message);
  await refused('an empty order', ['POST', '/orders', {}], { market: 'required', side: 'value', type: 'value' });
  await refused('a list instead of an order', ['POST', '/orders', [1]], { body: 'invalid_type' });
  await refused('amounts as JSON numbers', ['POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: 61000, quantity: 0.01 }], { price: 'type', quantity: 'type' });
  await refused('amounts that aren\'t decimals', ['POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '6e4', quantity: '0,01' }], { price: 'decimal', quantity: 'decimal' });
  await refused('more decimals than the money code holds', ['POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '61000', quantity: '0.0000000000000000001' }], { quantity: 'decimal' });
  await refused('a market buy without a total, a market sell without an amount', ['POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'market', quantity: '1' }], { quoteQuantity: 'required' });
  await refused('   and the sell', ['POST', '/orders', { market: 'BTC-USDT', side: 'sell', type: 'market' }], { quantity: 'required' });
  check('none of them became an order', (await snapshot('orders')).orders.length === before);
  r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '61000.005', quantity: '0.001' });
  check('a price off the tick is still the engine\'s 422', r.status === 422 && r.body.error.code === 'MARKET_RULES' && r.body.error.details.price.code === 'tick', JSON.stringify(r.body));
  await refused('GET /orders?limit=500', ['GET', '/orders', null, { limit: '500' }], { limit: 'range' });
  await refused('   limit=0, state=closed, side=hold and a market that isn\'t one', ['GET', '/orders', null, { limit: '0', state: 'closed', side: 'hold', market: '$ne' }], { state: 'value', market: 'format', side: 'value', limit: 'range' });
  for (const path of ['/trades', '/wallet/ledger', '/wallet/transactions', '/notifications', '/users/me/activity']) await refused(`   ${path}?limit=101`, ['GET', path, null, { limit: '101' }], { limit: 'range' });
  await refused('an offset that isn\'t a number', ['GET', '/wallet/ledger', null, { cursor: 'abc' }], { cursor: 'format' });
  check('candles may ask for 500, not 501', (await call('GET', '/markets/BTC-USDT/candles', null, { limit: '500' })).status === 200 && (await call('GET', '/markets/BTC-USDT/candles', null, { limit: '501' })).status === 400);
  r = await fetch(`${base}/api/v1/orders?side=buy&side=sell`, { headers: { Authorization: `Bearer ${(await call('POST', '/auth/refresh')).body.data.accessToken}` } });
  check('a parameter given twice: 400', r.status === 400);
  await refused('a query operator in place of an email', ['POST', '/auth/login', { email: { $ne: null }, password: { $ne: null } }], { email: 'type', password: 'type' });
  await refused('a sign-up with everything wrong', ['POST', '/auth/register', { email: 'nope', displayName: 'x', password: 'short' }], { email: 'format', displayName: 'length', password: 'weak' });
  await refused('a 2FA code that isn\'t six digits', ['POST', '/auth/login/2fa', { loginTicket: 'x', code: '12' }], { code: 'format' });
  await refused('a withdrawal without amount and address', ['POST', '/wallet/withdrawals', { asset: 'USDT' }], { amount: 'required', address: 'required' });
  await refused('a deposit of nothing', ['POST', '/wallet/deposits', { asset: 'BTC', amount: '0' }], { amount: 'positive' });
  await refused('an unknown theme', ['PATCH', '/users/me', { preferences: { theme: 'neon' } }], { 'preferences.theme': 'value' });
  r = await client().call('POST', '/auth/register', { email: '  Mixed.Case@Example.COM ', password: 'Correct-horse-42', displayName: '  Mixed   Case ', role: 'admin', isBot: true, kycStatus: 'approved' });
  check('sanitised: the email trimmed and lower-cased, unknown keys dropped', r.status === 201 && r.body.data.user.email === 'mixed.case@example.com' && r.body.data.user.displayName === 'Mixed   Case' && r.body.data.user.role === 'user' && r.body.data.user.kycStatus === 'none', JSON.stringify(r.body));
  r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: ' 60000.00 ', quantity: '0.001', status: 'filled', userId: newId });
  check('   an order\'s too', r.status === 202 && r.body.data.order.price === '60000.00' && r.body.data.order.status === 'pending' && (await snapshot('orders')).orders.find((o) => o.id === r.body.data.order.id).userId === DEMO, JSON.stringify(r.body));
  const raw = async (body, type = 'application/json') => fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': type }, body });
  check('a body that isn\'t JSON: 400', (await raw('{bad')).status === 400);
  r = await raw(JSON.stringify({ email: 'x'.repeat(120 * 1024) }));
  check('a body over 100 kb: 413', r.status === 413 && (await r.json()).error.code === 'PAYLOAD_TOO_LARGE');
  const t0 = performance.now();
  r = await raw(JSON.stringify({ email: `a@${'.'.repeat(90000)} x`, password: 'x' }));
  check('a 90 kb email is refused at once', r.status === 400 && performance.now() - t0 < 3000, `${Math.round(performance.now() - t0)} ms`);

  // 13. Identity images
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]);
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 9)]);
  const FORM = { fullName: ' New Person ', dateOfBirth: '1999-04-17', country: 'IN', documentType: 'passport', documentNumber: 'ab 12345' };
  const send = async (who, fields, files = {}) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    for (const [k, list] of Object.entries(files)) for (const [bytes, type, name] of list) form.append(k, new Blob([bytes], { type }), name);
    const res = await fetch(`${base}/api/v1/kyc`, { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: form });
    return { status: res.status, body: await res.json() };
  };
  const person = { token: (await newcomer.call('POST', '/auth/refresh')).body.data.accessToken };
  const folder = join(dataDir, 'uploads', 'kyc', newId);
  const doc = (bytes, type = 'image/jpeg', name = 'passport.jpg') => ({ documentImage: [[bytes, type, name]] });
  r = await send(person, FORM, doc(Buffer.concat([JPEG, Buffer.alloc(6 * 1024 * 1024)])));
  check('a 6 MB image: 413', r.status === 413 && r.body.error.code === 'PAYLOAD_TOO_LARGE' && r.body.error.details.documentImage === 'size', JSON.stringify(r.body));
  r = await send(person, FORM, doc(Buffer.from('%PDF-1.7'), 'application/pdf', 'scan.pdf'));
  check('a PDF: 400', r.status === 400 && r.body.error.details.documentImage === 'type', JSON.stringify(r.body));
  r = await send(person, FORM, doc(Buffer.from('%PDF-1.7 and more'), 'image/jpeg', 'scan.jpg'));
  check('a PDF that says it is a JPEG: 400', r.status === 400 && r.body.error.details.documentImage === 'type', JSON.stringify(r.body));
  r = await send(person, FORM, doc(PNG, 'image/jpeg', 'x.jpg'));
  check('a PNG that says it is a JPEG: 400', r.status === 400 && r.body.error.details.documentImage === 'type', JSON.stringify(r.body));
  r = await send(person, FORM);
  check('no image: 400', r.status === 400 && r.body.error.details.documentImage === 'required', JSON.stringify(r.body));
  r = await send(person, FORM, { documentImage: [[JPEG, 'image/jpeg', '1.jpg'], [JPEG, 'image/jpeg', '2.jpg']] });
  check('two documents: 400', r.status === 400 && r.body.error.details.documentImage === 'unexpected', JSON.stringify(r.body));
  r = await send(person, FORM, { ...doc(JPEG), avatar: [[JPEG, 'image/jpeg', 'a.jpg']] });
  check('a file the form doesn\'t have: 400', r.status === 400 && r.body.error.details.avatar === 'unexpected', JSON.stringify(r.body));
  r = await send(person, { ...FORM, dateOfBirth: '2001-02-31', country: 'india', documentType: 'library_card', documentNumber: '12' }, doc(JPEG));
  check('the fields: one detail each', r.status === 400 && JSON.stringify(r.body.error.details) === JSON.stringify({ dateOfBirth: 'format', country: 'format', documentType: 'value', documentNumber: 'length' }), JSON.stringify(r.body));
  r = await send(person, { ...FORM, dateOfBirth: '2015-01-01' }, doc(JPEG));
  check('under 18: 400', r.status === 400 && r.body.error.details.dateOfBirth === 'age');
  let res = await fetch(`${base}/api/v1/kyc`, { method: 'POST', headers: { Authorization: `Bearer ${person.token}`, 'Content-Type': 'multipart/form-data' }, body: 'x' });
  check('multipart without a boundary: 400', res.status === 400, String(res.status));
  res = await fetch(`${base}/api/v1/kyc`, { method: 'POST', headers: { Authorization: `Bearer ${person.token}`, 'Content-Type': 'multipart/form-data; boundary=abc' }, body: '--abc\r\nContent-Disposition: form-data; name="fullName"\r\n\r\nhalf' });
  check('a form cut short: 400', res.status === 400, String(res.status));
  check('a guest can\'t upload: 401', (await send({ token: '' }, FORM, doc(JPEG))).status === 401);
  check('nothing was saved for any of them', !existsSync(folder));
  r = await send(person, FORM, { documentImage: [[JPEG, 'image/jpeg', '../../../evil.jpg']], selfieImage: [[PNG, 'image/png', 'me.png']] });
  check('a JPEG and a PNG: 201', r.status === 201 && r.body.data.application.status === 'pending' && r.body.data.application.fullName === 'New Person' && r.body.data.application.documentNumberLast4 === '2345', JSON.stringify(r.body));
  const kycId = r.body.data.application.id;
  check('both on disk, under the user\'s id, named by the server', readdirSync(folder).sort().join() === `${kycId}-document.jpg,${kycId}-selfie.png` && readFileSync(join(folder, `${kycId}-document.jpg`)).equals(JPEG), existsSync(folder) ? readdirSync(folder).join() : 'no folder');
  check('the answer doesn\'t say where', !/images|uploads|\.jpg/.test(JSON.stringify(r.body)));
  r = await send(person, FORM, doc(JPEG));
  check('a second application: 409', r.status === 409);
  const reviewer = client();
  reviewer.setToken((await reviewer.call('POST', '/auth/login', { email: 'admin@orichal.app', password: 'orichal-demo' })).body.data.accessToken);
  const adminToken = (await reviewer.call('POST', '/auth/refresh')).body.data.accessToken;
  const image = (id, which, token) => fetch(`${base}/api/v1/admin/kyc/${id}/document${which ? `?image=${which}` : ''}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  res = await image(kycId, '', adminToken);
  check('the admin gets the document\'s bytes, as image/jpeg, never cached', res.status === 200 && res.headers.get('content-type') === 'image/jpeg' && res.headers.get('cache-control') === 'no-store' && res.headers.get('content-length') === String(JPEG.length) && Buffer.from(await res.arrayBuffer()).equals(JPEG), `${res.status} ${res.headers.get('content-type')} ${res.headers.get('cache-control')}`);
  res = await image(kycId, 'selfie', adminToken);
  check('   and the selfie', res.headers.get('content-type') === 'image/png' && Buffer.from(await res.arrayBuffer()).equals(PNG));
  check('   both views are in the audit log', (await snapshot('audit')).audit.filter((a) => a.action === 'admin.kyc_document_viewed' && a.targetId === kycId).map((a) => a.metadata.image).sort().join() === 'document,selfie');
  const seededKyc = (await snapshot('kyc')).kyc.find((k) => !k.images).id;
  res = await image(seededKyc, '', adminToken);
  check('a seeded application has no image: the placeholder', res.status === 200 && (await res.json()).data.placeholder === true);
  check('its applicant 403, a guest 401, an unknown one 404', [(await image(kycId, '', person.token)).status, (await image(kycId, '', null)).status, (await image('abc', '', adminToken)).status].join() === '403,401,404');
  check('no folder is served to the public', !(await (await fetch(`${base}/uploads/kyc/${newId}/${kycId}-document.jpg`)).headers.get('content-type')).startsWith('image/'));

  const everything = JSON.stringify(await snapshot());
  check('no password, hash, code or token anywhere in the working set', !/orichal-demo|Correct-horse|\$2[aby]\$|passwordHash|codeHash|"credentials"|"lockouts"|refreshTokens|eyJ[\w-]+\.eyJ/.test(everything));
  const people = (await snapshot('users')).users;
  check('the lock is on the user', Date.parse(people.find((u) => u.id === newId).lockUntil) > Date.now());

  // 14. The database scripts again, after everything above, and a reset that takes the images along
  script = runScript('check-ledger.js');
  check('db:check-ledger after all of it', script.status === 0, script.stdout);
  script = runScript('explain.js');
  check('db:explain after all of it', script.status === 0, script.stdout);
  await call('POST', '/demo/reset');
  check('a reset deletes the images', !existsSync(folder));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
