// Drives Admin · System: the health cards, the engine table and the refresh.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();

try {
  await signIn('admin');
  await page.goto(`${base}/admin/system`);
  await page.waitForSelector('.health-card');
  check('six parts of the stack', (await page.locator('.health-card').count()) === 6);
  const states = await page.locator('.health-card .status').allInnerTexts();
  check('all well', JSON.stringify(states) === JSON.stringify(['Healthy', 'Healthy', 'Leading', 'Keeping up', 'Healthy', '2 of 2 ready']), JSON.stringify(states));
  check('mongo', /Replica set rs0: a primary and two secondaries\.\s+ping \d ms/.test(await text('.health-card:nth-child(1)')));
  const width = await page.evaluate(() => parseFloat(document.querySelector('.health-bar span').style.width));
  check('redis memory bar', width > 10 && width < 25 && /\d+ \/ 256 MB/.test(await text('.health-meter')), String(width));
  check('engine leader', /Leader engine-7f2c, last heartbeat \d+ s ago\./.test(await text('.health-card:nth-child(3)')));

  const rows = await page.locator('.engine-table tbody tr').allInnerTexts();
  check('four markets', rows.length === 4);
  check('BNB halted, ladder cancelled', /BNB\/USDT\s+Halted[\s\S]*config · halt[\s\S]*0 bids · 0 asks[\s\S]*Ladder cancelled/.test(rows[3]), rows[3]);
  check('others quoting', rows.slice(0, 3).every((r) => /Open[\s\S]*Quoting 5 a side/.test(r)));

  const first = await text('.admin-subtitle');
  check('checked line', /^Checked \d\d:\d\d:\d\d · refreshes every 5 s$/.test(first));
  await page.waitForFunction((was) => document.querySelector('.admin-subtitle')?.textContent !== was, first, { timeout: 8000 });
  check('refreshes by itself', true);

  await page.click('button:has-text("Open Grafana")');
  await page.waitForSelector('.toast:has-text("Grafana comes with the backend")');
  check('grafana explained', true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
