// Drives Admin · Withdrawals: approving after a confirmation, rejecting with a reason.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const rows = () => page.locator('.withdrawals-table tbody tr:not(:has(.wd-empty))').count();
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 6000 });
const ledgerFor = (name, status) => page.evaluate(async ([who, state]) => {
  const { db } = await import('/src/models/api/mock/db.js');
  const t = db().transactions.find((x) => x.type === 'withdrawal' && x.userDisplayName === who && x.status === state);
  return db().ledger.filter((e) => e.refType === 'transaction' && e.refId === t.id).map((e) => e.type).sort();
}, [name, status]);

try {
  await signIn('admin');
  await page.goto(`${base}/admin/withdrawals`);
  await page.waitForSelector('.withdrawals-table tbody tr');
  check('three waiting', (await rows()) === 3 && /Pending\s*3/.test(await text('.admin-tabs .tab.current')) && (await text('.withdrawals-panel .list-foot p')) === '3 of 3, oldest first');
  const first = await text('.withdrawals-table tbody tr');
  check('oldest first, with the facts', /Isha Kapoor[\s\S]*KYC approved[\s\S]*USDT\s+1,200\.00\s+1\.00\s+1,199\.00\s+sim-usdt-2be4…a0c1/.test(first), first);
  check('oldest wait in brass', (await page.locator('.withdrawals-table .queue-wait-oldest').count()) === 1);
  check('copy the address', /^Copy the address sim-usdt-/.test(await page.getAttribute('.withdrawals-table tbody tr .copy-btn', 'aria-label')));

  // Approve Isha, after backing out once
  await page.click('button[aria-label="Approve Isha Kapoor\'s withdrawal"]');
  await page.waitForSelector('.dialog-confirm');
  check('confirmation says what happens', /1,199\.00 USDT goes to sim-usdt-2be4…a0c1/.test(await text('.dialog-confirm')));
  await page.click('.dialog-confirm button:has-text("Not yet")');
  await page.waitForSelector('.dialog-confirm', { state: 'detached' });
  check('not yet leaves it', (await rows()) === 3);
  await page.click('button[aria-label="Approve Isha Kapoor\'s withdrawal"]');
  await page.click('.dialog-confirm button:has-text("Approve")');
  await page.waitForSelector('.toast:has-text("Withdrawal approved")');
  await until(() => document.querySelectorAll('.withdrawals-table tbody tr').length === 2);
  check('approved leaves the queue', /Pending\s*2/.test(await text('.admin-tabs .tab.current')));
  check('withdrawal and fee on the ledger', JSON.stringify(await ledgerFor('Isha Kapoor', 'completed')) === JSON.stringify(['withdrawal', 'withdrawal_fee', 'withdrawal_lock'].sort()), JSON.stringify(await ledgerFor('Isha Kapoor', 'completed')));
  await until(() => /Withdrawals[\s\S]*2/.test(document.querySelector('.admin-nav a[href="/admin/withdrawals"]')?.textContent ?? ''));
  check('sidebar count follows', true);

  // Reject Kabir with a reason
  await page.click('button[aria-label="Reject Kabir Anand\'s withdrawal"]');
  await page.waitForSelector('.reject-dialog');
  await page.click('.reject-suggestions button:has-text("The address looks wrong")');
  await page.click('.reject-dialog button[type="submit"]');
  await page.waitForSelector('.toast:has-text("Withdrawal rejected")');
  await until(() => document.querySelectorAll('.withdrawals-table tbody tr').length === 1);
  check('unlocked on the ledger', (await ledgerFor('Kabir Anand', 'rejected')).includes('withdrawal_unlock'));

  // The decided lists
  await page.click('.admin-tabs .tab:has-text("Completed")');
  await until(() => /Isha Kapoor/.test(document.querySelector('.withdrawals-table tbody')?.textContent ?? ''));
  check('completed with a hash', /0x[0-9a-f]+…[0-9a-f]+/.test(await text('.withdrawals-table tbody tr')) && (await page.locator('.wd-explain').count()) === 0);
  await page.click('.admin-tabs .tab:has-text("Rejected")');
  await until(() => /Kabir Anand/.test(document.querySelector('.withdrawals-table tbody')?.textContent ?? ''));
  check('rejected with the reason', /The address looks wrong/.test(await text('.withdrawals-table tbody tr')));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
