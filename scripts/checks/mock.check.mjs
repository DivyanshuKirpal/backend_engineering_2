// Drives the mock backend in a real browser and checks its money stays consistent:
// sign-in with 2FA, orders that rest, fill and cancel, the market rules, a
// deposit and a withdrawal, an admin's approval, and the ledger after each.
import { start } from './harness.mjs';

const { page, base, check, fail, finish } = await start();

try {
  await page.goto(`${base}/`);
  await page.waitForSelector('.app-header');
  const result = await page.evaluate(async () => {
    const server = await import('/src/models/api/mock/server.js');
    const money = await import('/src/models/domain/money.js');
    await server.resetDemo();
    const log = [];
    let token = null;
    const call = async (method, path, body, query = {}, headers = {}) => {
      const res = await server.handle({ method, path, body, query, headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      return res;
    };
    const ok = (label, cond, extra = '') => log.push(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ` (${extra})` : ''}`);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      ok(`ledger = wallet ${label}`, bad.length === 0, bad.join('; '));
      return bal;
    };

    // 1. Login with 2FA
    let r = await call('POST', '/auth/login', { email: 'demo@orichal.app', password: 'wrong' });
    ok('wrong password is 401', r.status === 401);
    r = await call('POST', '/auth/login', { email: 'demo@orichal.app', password: 'orichal-demo' });
    ok('2FA asked', r.body.data?.requires2fa === true);
    const ticket = r.body.data.loginTicket;
    r = await call('POST', '/auth/login/2fa', { loginTicket: ticket, code: '000000' });
    ok('wrong code shows tries left', r.status === 400 && r.body.error.details.attemptsLeft === 4, JSON.stringify(r.body.error));
    r = await call('POST', '/auth/login/2fa', { loginTicket: ticket, code: '123456' });
    ok('2FA login', r.status === 200 && r.body.data.user.email === 'demo@orichal.app');
    token = r.body.data.accessToken;

    let bal = await consistent('after login');
    const usdt = () => bal.find((b) => b.asset === 'USDT');
    ok('USDT free 1616.000800', usdt().available === '1616.000800', usdt().available);

    // 2. Pending order turns open (replayed at start-up)
    await sleep(1600);
    r = await call('GET', '/orders', null, { state: 'open' });
    const a91c = r.body.data.items.find((o) => o.id.endsWith('a91c'));
    ok('seeded pending order applied', a91c?.status === 'open' && a91c.appliedAt != null, a91c?.status);

    // 3. A buy that crosses the book fills now as a taker
    const book = (await call('GET', '/markets/BTC-USDT/orderbook', null, { depth: 5 })).body.data;
    ok('book has seq', typeof book.seq === 'number', String(book.seq));
    const bestAsk = book.asks[0][0];
    r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: money.add(bestAsk, '5'), quantity: '0.001' }, {}, { 'Idempotency-Key': 'smoke-1' });
    ok('order accepted 202 pending', r.status === 202 && r.body.data.order.status === 'pending', `${r.status} ${JSON.stringify(r.body.error ?? '')}`);
    const id1 = r.body.data.order.id;
    const again = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: money.add(bestAsk, '5'), quantity: '0.001' }, {}, { 'Idempotency-Key': 'smoke-1' });
    ok('same Idempotency-Key returns the same order', again.body.data.order.id === id1);
    await sleep(1000);
    r = await call('GET', `/orders/${id1}`);
    ok('crossing order filled', r.body.data.order.status === 'filled', r.body.data.order.status);
    ok('fill at resting price (taker)', r.body.data.fills[0]?.role === 'taker' && money.lte(r.body.data.fills[0].price, money.add(bestAsk, '5')), JSON.stringify(r.body.data.fills[0]));
    ok('order ledger has lock, debit, credit, fee, unlock', ['order_lock', 'trade_debit', 'trade_credit', 'trade_fee', 'order_unlock'].every((t) => r.body.data.ledger.some((e) => e.type === t)), r.body.data.ledger.map((e) => e.type).join(','));
    bal = await consistent('after taker fill');

    // 4. A resting buy, then cancel
    r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '61000.00', quantity: '0.002' });
    const id2 = r.body.data.order.id;
    await sleep(1000);
    r = await call('GET', `/orders/${id2}`);
    ok('resting order is open', r.body.data.order.status === 'open', r.body.data.order.status);
    const snap = (await call('GET', '/markets/BTC-USDT/orderbook', null, { depth: 100 })).body.data;
    ok('resting order on the book', snap.bids.some(([p]) => p === '61000.00'));
    r = await call('DELETE', `/orders/${id2}`);
    ok('cancel 202', r.status === 202);
    await sleep(800);
    r = await call('GET', `/orders/${id2}`);
    ok('cancelled with reason user', r.body.data.order.status === 'cancelled' && r.body.data.order.cancelReason === 'user');
    bal = await consistent('after cancel');

    // 5. Rules
    r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '62140.505', quantity: '0.01' });
    ok('tick rule 422 MARKET_RULES', r.status === 422 && r.body.error.code === 'MARKET_RULES');
    r = await call('POST', '/orders', { market: 'BNB-USDT', side: 'buy', type: 'limit', price: '588.00', quantity: '0.1' });
    ok('halted market 409', r.status === 409 && r.body.error.code === 'MARKET_HALTED');
    r = await call('POST', '/orders', { market: 'BTC-USDT', side: 'buy', type: 'limit', price: '62000.00', quantity: '1' });
    ok('insufficient balance 422', r.status === 422 && r.body.error.code === 'INSUFFICIENT_BALANCE');

    // 6. Market buy by quote
    r = await call('POST', '/orders', { market: 'SOL-USDT', side: 'buy', type: 'market', quoteQuantity: '50' });
    const id3 = r.body.data.order.id;
    await sleep(1000);
    r = await call('GET', `/orders/${id3}`);
    ok('market buy filled', r.body.data.order.status === 'filled', `${r.body.data.order.status} filled ${r.body.data.order.filledQuantity}`);
    bal = await consistent('after market buy');

    // 7. Deposit and withdrawal
    r = await call('POST', '/wallet/deposits', { asset: 'BTC', amount: '0.25' });
    ok('deposit 201 completed', r.status === 201 && r.body.data.transaction.status === 'completed');
    r = await call('POST', '/wallet/deposits', { asset: 'BTC', amount: '2' });
    ok('deposit over limit 400', r.status === 400);
    r = await call('POST', '/wallet/withdrawals', { asset: 'USDT', amount: '500', address: 'sim-usdt-c41e09ab77d2f310', code: '123456' });
    ok('withdrawal 201 pending', r.status === 201 && r.body.data.transaction.status === 'pending' && r.body.data.transaction.receiveAmount === '499.000000', JSON.stringify(r.body.error ?? r.body.data.transaction.receiveAmount));
    const wid = r.body.data.transaction.id;
    r = await call('POST', '/wallet/withdrawals', { asset: 'USDT', amount: '20', address: 'bad-address', code: '123456' });
    ok('bad address 400', r.status === 400);
    r = await call('POST', '/wallet/withdrawals', { asset: 'USDT', amount: '20', address: 'sim-usdt-c41e09ab77d2f310', code: '111111' });
    ok('wrong 2FA code 400', r.status === 400 && r.body.error.code === 'INVALID_2FA_CODE');
    bal = await consistent('after deposit and withdrawal');

    // 8. Admin approves
    await call('POST', '/auth/logout');
    r = await call('POST', '/auth/login', { email: 'admin@orichal.app', password: 'orichal-demo' });
    token = r.body.data.accessToken;
    ok('admin login without 2FA', r.status === 200 && r.body.data.user.role === 'admin');
    r = await call('GET', '/admin/stats');
    ok('stats: 54 users, 6 new, 7 KYC, 4 withdrawals', r.body.data.users === 54 && r.body.data.usersNew7d === 6 && r.body.data.pendingKyc === 7 && r.body.data.pendingWithdrawals === 4, JSON.stringify({ u: r.body.data.users, n: r.body.data.usersNew7d, k: r.body.data.pendingKyc, w: r.body.data.pendingWithdrawals, open: r.body.data.openOrders, bot: r.body.data.openOrdersBot, vol: r.body.data.volume24h }));
    r = await call('PATCH', `/admin/withdrawals/${wid}`, { decision: 'approve' });
    ok('withdrawal approved', r.body.data?.transaction.status === 'completed', JSON.stringify(r.body.error ?? ''));
    r = await call('GET', '/admin/users', null, { page: 1 });
    ok('users page 1 of 54, demo first', r.body.data.total === 54 && r.body.data.items[0].email === 'demo@orichal.app');
    r = await call('GET', '/admin/system/health');
    ok('health has 4 markets', r.body.data.engine.markets.length === 4);

    // 9. Back as demo: the ledger still adds up after the approval
    await call('POST', '/auth/logout');
    r = await call('POST', '/auth/login', { email: 'demo@orichal.app', password: 'orichal-demo' });
    r = await call('POST', '/auth/login/2fa', { loginTicket: r.body.data.loginTicket, code: '123456' });
    token = r.body.data.accessToken;
    await consistent('after admin approval');
    return log;
  });
  for (const line of result) check(line.slice(5), line.startsWith('ok'));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
