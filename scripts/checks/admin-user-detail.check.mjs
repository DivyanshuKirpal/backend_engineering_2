// Drives Admin · User: the profile, balances, open orders and transactions;
// freezing (which cancels open orders) and unfreezing with a reason; and role
// changes, which never demote the last admin.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 6000 });
const DEMO = '66f19a3c5e7b2d4f8a1c0e01';
const DANIEL = '66e62281a147fcf69e90d5a1';
const ROHAN = '66e8d47b2c9f5a1e3d6b0a12';
const fact = (key) => text(`.user-fact-${key} dd`);
const balanceRow = (code) => text(`.user-balances tbody tr:has-text("${code}")`);

try {
  await signIn('admin');
  // Wait for the seeded pending order to reach the book, so all four are open
  await page.waitForTimeout(2500);

  // From the list
  await page.goto(`${base}/admin/users`);
  await page.waitForSelector('.users-table tbody tr');
  await page.click('.users-table a[aria-label="Open Demo trader"]');
  await page.waitForSelector('.user-profile');
  check('opened from the list', new URL(page.url()).pathname === `/admin/users/${DEMO}`);
  check('topbar and title', (await text('.admin-title')) === 'Demo trader' && /^demo@orichal\.app · joined \d+ \w+$/.test(await text('.admin-subtitle')) && (await page.title()) === 'Demo trader · Users · Orichal', await page.title());
  check('sidebar marks Users', (await page.getAttribute('.admin-nav a[aria-current="page"]', 'href')) === '/admin/users');
  check('profile facts', (await fact('role')) === 'User' && /Active/.test(await fact('status')) && /Approved/.test(await fact('kyc')) && (await fact('twofa')) === 'On' && /^≈ [\d,]+\.\d\d USDT$/.test(await fact('holdings')), await fact('holdings'));
  check('five balances', (await page.locator('.user-balances tbody tr').count()) === 5);
  const usdt = await balanceRow('USDT');
  check('USDT free and in orders', /6,823\.50\s+1,616\.00\s+5,207\.50\s+6,823\.50/.test(usdt), usdt);
  check('four open orders, read-only', (await page.locator('.orders-open tbody tr').count()) === 4 && (await page.locator('.orders-open button').count()) === 0 && (await page.locator('.orders-open a').count()) === 0 && (await page.textContent('#user-orders-title')) === 'Open orders · 4');
  check('the deposit', /Deposit\s+USDT\s+\+2,000\.00[\s\S]*Completed/.test(await text('.transactions-account tbody tr')), await text('.transactions-account tbody tr'));
  check('marked undesigned', /Not drawn yet/.test(await text('.undesigned-note')));

  // Freeze, with a reason
  await page.click('button:has-text("Freeze account")');
  await page.waitForSelector('.reject-dialog');
  check('freeze says what happens', /cancels their 4 open orders/.test(await text('.reject-dialog')));
  await page.click('.reject-dialog button[type="submit"]');
  check('a reason is required', /Give a reason/.test(await text('.reject-dialog')));
  await page.click('.reject-suggestions button:has-text("Flooding the book with orders")');
  await page.click('.reject-dialog button[type="submit"]');
  await page.waitForSelector('.toast:has-text("Account frozen")');
  check('toast counts the cancelled orders', /4 open orders were cancelled/.test(await text('.toast:has-text("Account frozen")')));
  await until(() => /Frozen/.test(document.querySelector('.user-action-head')?.textContent ?? ''));
  check('frozen, with the reason', /Frozen \d+ \w+, \d\d:\d\d by you: Flooding the book with orders\./.test(await text('.user-action-note')), await text('.user-action-note'));
  check('open orders cancelled', (await page.locator('.orders-open').count()) === 0 && /Freezing cancelled any they had/.test(await text('.user-detail .orders-empty')));
  check('their locks released', /6,823\.50\s+6,823\.50\s+0\s+6,823\.50/.test(await balanceRow('USDT')), await balanceRow('USDT'));
  const after = await page.evaluate(async (id) => {
    const { db } = await import('/src/models/api/mock/db.js');
    const orders = db().orders.filter((o) => o.userId === id && o.cancelReason === 'account_frozen').length;
    const entry = db().audit.filter((a) => a.action === 'admin.user_frozen' && a.targetId === id).at(-1);
    return { orders, entry: entry?.metadata };
  }, DEMO);
  check('cancelled as account_frozen, and audited', after.orders === 4 && after.entry?.ordersCancelled === 4 && after.entry?.reason === 'Flooding the book with orders', JSON.stringify(after));

  // Unfreeze
  await page.click('button:has-text("Unfreeze account")');
  await page.waitForSelector('.reject-dialog');
  await page.click('.reject-suggestions button:has-text("Reviewed and cleared")');
  await page.click('.reject-dialog button[type="submit"]');
  await page.waitForSelector('.toast:has-text("Account unfrozen")');
  await until(() => /Active/.test(document.querySelector('.user-action-head')?.textContent ?? ''));
  check('unfrozen', /Active/.test(await fact('status')));

  // Role: back out once, then make them an admin, then a user again
  check('change role off until a new one is picked', await page.isDisabled('button:has-text("Change role")'));
  await page.selectOption('#user-role', 'admin');
  await page.click('button:has-text("Change role")');
  await page.waitForSelector('.dialog-confirm');
  check('promotion says what it gives', /Make Demo trader an admin\?/.test(await text('.dialog-confirm .dialog-title')) && /approve withdrawals/.test(await text('.dialog-confirm')));
  await page.click('.dialog-confirm button:has-text("Not now")');
  await page.waitForSelector('.dialog-confirm', { state: 'detached' });
  check('not now keeps the role', (await page.inputValue('#user-role')) === 'user' && (await fact('role')) === 'User');
  await page.selectOption('#user-role', 'admin');
  await page.click('button:has-text("Change role")');
  await page.click('.dialog-confirm button:has-text("Make admin")');
  await page.waitForSelector('.toast:has-text("Role changed")');
  await until(() => document.querySelector('.user-fact-role dd')?.textContent === 'Admin');
  check('now an admin', (await page.locator('.user-profile .user-tile-admin').count()) === 1 && (await page.locator('.user-actions .role-tag').count()) === 1);
  await page.selectOption('#user-role', 'user');
  await page.click('button:has-text("Change role")');
  await page.click('.dialog-confirm button:has-text("Make user")');
  await page.waitForSelector('.toast:has-text("is now a user")');
  await until(() => document.querySelector('.user-fact-role dd')?.textContent === 'User');
  check('and a user again', true);

  // Your own page: no freezing yourself, and the only admin stays one
  await page.goto(`${base}/admin/users/${ROHAN}`);
  await page.waitForSelector('.user-profile');
  check('can\'t freeze yourself', await page.isDisabled('button:has-text("Freeze account")') && /can't freeze your own account/.test(await text('.user-actions')));
  check('the last admin stays one', await page.isDisabled('#user-role') && /only admin can't become a user/.test(await text('.user-actions')));
  const refused = await page.evaluate(async (id) => {
    const api = await import('/src/models/api/admin.api.js');
    try {
      await api.setUserRole(id, { role: 'user' });
      return 'changed';
    } catch (err) {
      return `${err.status} ${err.code}`;
    }
  }, ROHAN);
  check('the API refuses too', refused === '409 CONFLICT', refused);

  // Someone frozen before: the reason from the audit log
  await page.goto(`${base}/admin/users/${DANIEL}`);
  await page.waitForSelector('.user-profile');
  check('a frozen account says why', /by you: Flooding BTC\/USDT with tiny orders that slowed the book\./.test(await text('.user-action-note')) && (await text('.user-actions .btn')) === 'Unfreeze account');
  check('no open orders', (await page.textContent('#user-orders-title')) === 'Open orders · 0');

  // Nobody there
  await page.goto(`${base}/admin/users/000000000000000000000000`);
  await page.waitForSelector('.user-missing');
  check('an unknown id', /no one with that id/.test(await text('.user-missing')) && (await page.getAttribute('.user-missing a', 'href')) === '/admin/users');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of [DEMO, DANIEL]) {
    await page.goto(`${base}/admin/users/${id}`);
    await page.waitForSelector('.user-profile');
    check(`no sideways scroll on phones: ${id === DEMO ? 'demo' : 'Daniel'}`, await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  }
} catch (err) {
  fail(err);
} finally {
  await finish();
}
