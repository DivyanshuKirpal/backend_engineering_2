// Calls the API over HTTP from Node, as Postman would, and checks that its
// money stays consistent: sign-in with 2FA and the rt cookie, refresh and
// logout, orders that rest, fill and cancel, the market rules, a deposit and a
// withdrawal, an admin's approval, and the ledger after each. In the static
// phase this file drove the mock backend inside the page (mock.check.mjs).
import * as money from '../../client/src/models/domain/money.js';
import { start } from './harness.mjs';

const { base, check, fail, finish, snapshot } = await start({ browser: false });
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
  const everything = JSON.stringify(await snapshot());
  check('no password, hash, code or token anywhere in the working set', !/orichal-demo|Correct-horse|\$2[aby]\$|passwordHash|codeHash|"credentials"|"lockouts"|refreshTokens|eyJ[\w-]+\.eyJ/.test(everything));
  const people = (await snapshot('users')).users;
  check('the lock is on the user', Date.parse(people.find((u) => u.id === newId).lockUntil) > Date.now());
} catch (err) {
  fail(err);
} finally {
  await finish();
}
