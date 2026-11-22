// Calls the API over HTTP from Node, as Postman would, and checks that its
// money stays consistent: sign-in with 2FA and the rt cookie, refresh and
// logout, orders that rest, fill and cancel, the market rules, a deposit and a
// withdrawal, an admin's approval, and the ledger after each. In the static
// phase this file drove the mock backend inside the page (mock.check.mjs).
import * as money from '../../client/src/models/domain/money.js';
import { start } from './harness.mjs';

const { base, check, fail, finish } = await start({ browser: false });
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
  r = await call('POST', '/auth/refresh');
  check('refresh with the cookie: a new access token', r.status === 200 && r.body.data.accessToken && r.body.data.accessToken !== firstToken);
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
} catch (err) {
  fail(err);
} finally {
  await finish();
}
