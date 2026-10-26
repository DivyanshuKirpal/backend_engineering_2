// Drives Admin · Users: paging, search, filters and the link to a person.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const rows = () => page.locator('.users-table tbody tr:not(:has(.users-empty))').count();
const summary = () => text('.list-foot p');
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 });

try {
  await signIn('admin');
  await page.goto(`${base}/admin/users`);
  await page.waitForSelector('.users-table tbody tr');
  check('ten people', (await rows()) === 10 && (await summary()) === 'Showing 1–10 of 54, newest first');
  check('topbar count', (await text('.admin-subtitle')) === '54 people · the two bot accounts are hidden');
  check('newest first', /Demo trader/.test(await text('.users-table tbody tr')));
  check('admin tag and tile', (await page.locator('.role-tag').count()) === 1 && (await page.locator('.user-tile-admin').count()) === 1);
  check('previous off on page 1', await page.isDisabled('.pagination .page-step:not(.page-next)'));

  await page.click('.pagination button[aria-label="Page 2"]');
  await until(() => /Showing 11–20 of 54/.test(document.querySelector('.list-foot p')?.textContent ?? ''));
  check('page 2', (await rows()) === 10 && (await page.getAttribute('.pagination button[aria-current="page"]', 'aria-label')) === 'Page 2');
  await page.click('.pagination button[aria-label="Page 6"]');
  await until(() => /Showing 51–54 of 54/.test(document.querySelector('.list-foot p')?.textContent ?? ''));
  check('last page', (await rows()) === 4 && await page.isDisabled('.pagination .page-next'), JSON.stringify({ rows: await rows(), next: await page.isDisabled('.pagination .page-next'), html: await page.evaluate(() => document.querySelector('.pagination')?.outerHTML.slice(0, 300)) }));

  await page.fill('#users-search', 'kabir');
  await until(() => document.querySelectorAll('.users-table tbody tr').length === 1 && /Kabir Anand/.test(document.querySelector('.users-table tbody')?.textContent ?? ''));
  check('search by name', /Showing 1–1 of 1/.test(await summary()));
  check('topbar keeps everyone', (await text('.admin-subtitle')).startsWith('54 people'));
  await page.fill('#users-search', 'd.okafor');
  await until(() => /Daniel Okafor/.test(document.querySelector('.users-table tbody')?.textContent ?? '') && document.querySelectorAll('.users-table tbody tr').length === 1);
  check('search by email', /Frozen/.test(await text('.users-table tbody tr')) && /Rejected/.test(await text('.users-table tbody tr')));
  await page.fill('#users-search', 'zzz');
  await page.waitForSelector('.users-empty');
  check('no match', (await text('.users-empty')) === 'No one matches these filters.');
  await page.fill('#users-search', '');
  await until(() => document.querySelectorAll('.users-table tbody tr').length === 10);

  await page.selectOption('#users-role', 'admin');
  await until(() => document.querySelectorAll('.users-table tbody tr').length === 1);
  check('admins', /Rohan Sethi/.test(await text('.users-table tbody tr')));
  await page.selectOption('#users-role', 'all');
  await page.selectOption('#users-status', 'frozen');
  await until(() => document.querySelectorAll('.users-table tbody tr').length >= 1 && [...document.querySelectorAll('.users-table tbody tr')].every((r) => /Frozen/.test(r.textContent)));
  check('frozen only', /Daniel Okafor/.test(await text('.users-table tbody')));

  const href = await page.getAttribute('.users-table tbody tr a:has-text("Open")', 'href');
  check('link to the person', /^\/admin\/users\/[0-9a-f]{24}$/.test(href), href);

  await page.selectOption('#users-status', 'all');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  check('phone pager', (await text('.page-of')) === '1 of 6');
} catch (err) {
  fail(err);
} finally {
  await finish();
}
