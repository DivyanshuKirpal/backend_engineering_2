// Drives the admin dashboard: the numbers, the chart and its table, the queues.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();

try {
  await signIn('admin');
  await page.goto(`${base}/admin`);
  await page.waitForSelector('.stat-card');
  check('six numbers', (await page.locator('.stat-card').count()) === 6);
  check('users', /Users\s+54\s+\+6 this week/.test(await text('.stat-card:nth-child(1)')), await text('.stat-card:nth-child(1)'));
  check('volume with its change', /17\.\d\dM\s*USDT/.test(await text('.stat-card:nth-child(2)')) && /[+−]\d+\.\d% on the day before/.test(await text('.stat-card:nth-child(2)')), await text('.stat-card:nth-child(2)'));
  check('open orders and the ladder', /52\s+30 of them are the market maker's ladder/.test(await text('.stat-card:nth-child(4)')), await text('.stat-card:nth-child(4)'));
  check('queues waiting, in brass', /7\s+Oldest waited 2 h 1\d m/.test(await text('.stat-card:nth-child(5)')) && (await page.locator('.stat-card-alert').count()) === 2);
  check('topbar', (await text('.admin-title')) === 'Dashboard' && /^Updated \d\d:\d\d:\d\d · bot accounts left out of user numbers$/.test(await text('.admin-subtitle')));
  check('sidebar badges', /KYC review\s*,? ?waiting: ?7|KYC review[\s\S]*7/.test(await text('.admin-nav')) && (await page.getAttribute('.admin-nav a[aria-current="page"]', 'href')) === '/admin');

  // The chart and its table
  check('fourteen bars', (await page.locator('.vbars-bar').count()) === 14);
  check('two values labelled', (await page.locator('.vbars-value').count()) === 2);
  check('scale', (await page.locator('.vbars-tick').allInnerTexts()).join(' ') === '0 5M 10M 15M 20M');
  check('chart has a summary', /^Daily traded volume from \d+ \w+ to \d+ \w+: highest .*M on .*, latest .*M\.$/.test(await page.getAttribute('.vbars', 'aria-label')));
  await page.click('.volume-tabs .tab:has-text("Table")');
  await page.waitForSelector('.volume-table');
  check('table view', (await page.locator('.volume-table tbody tr').count()) === 14 && (await page.getAttribute('.volume-tabs .tab:has-text("Table")', 'aria-selected')) === 'true');
  await page.keyboard.press('ArrowLeft');
  await page.waitForSelector('.vbars');
  const focused = await page.waitForFunction(() => /Chart/.test(document.activeElement?.textContent ?? ''), null, { timeout: 2000 }).then(() => true, () => false);
  check('arrow key back to the chart', focused, await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));

  // The queues
  check('three of each queue', (await page.locator('#kyc-queue-title').count()) === 1 && (await page.locator('.queue-card').first().locator('.queue-row').count()) === 3 && (await page.locator('.queue-card').nth(1).locator('.queue-row').count()) === 3);
  check('oldest first, in brass', /Aarav Mehta\s+India · passport/.test(await text('.queue-card .queue-row')) && (await page.locator('.queue-wait-oldest').count()) === 2);
  check('withdrawal amounts', /Isha Kapoor\s+1,200\.00 USDT/.test(await text('.queue-card:nth-child(2) .queue-row')));
  await page.click('.queue-card:nth-child(1) a:has-text("Review the queue")');
  await page.waitForURL('**/admin/kyc');
  check('KYC queue link', true);
  await page.goBack();
  await page.waitForSelector('.queue-card');
  check('withdrawal queue link', (await page.getAttribute('.queue-card:nth-child(2) a:has-text("Review the queue")', 'href')) === '/admin/withdrawals');

  // Phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.click('.admin-menu-btn');
  check('phone menu opens', await page.isVisible('.admin-nav a:has-text("Users")'));

  // Only admins
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn('demo', { fresh: false });
  await page.goto(`${base}/admin`);
  await page.waitForFunction(() => location.pathname !== '/admin');
  check('a trader is turned away', !new URL(page.url()).pathname.startsWith('/admin'), page.url());
} catch (err) {
  fail(err);
} finally {
  await finish();
}
