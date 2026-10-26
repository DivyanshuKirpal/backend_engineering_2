// Drives Fees: the trading fees per market and the funding fees per asset.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();

try {
  await signIn('guest');
  await page.click('.app-footer a:has-text("Fees")');
  await page.waitForSelector('.info-table tbody tr');
  check('fees from the footer', new URL(page.url()).pathname === '/fees' && (await page.title()) === 'Fees · Orichal', await page.title());
  const tables = page.locator('.info-table');
  check('four markets', (await tables.nth(0).locator('tbody tr').count()) === 4);
  const btc = await tables.nth(0).locator('tbody tr').first().innerText();
  check('btc fees', /BTC\/USDT\s+0\.08%\s+0\.10%\s+5 USDT\s+0\.00001 BTC\s+0\.01\s+Open/.test(btc), btc);
  check('bnb halted', /BNB\/USDT[\s\S]*Halted/.test(await tables.nth(0).locator('tbody tr').nth(3).innerText()));
  const usdt = await tables.nth(1).locator('tbody tr').first().innerText();
  check('five assets, USDT first', (await tables.nth(1).locator('tbody tr').count()) === 5 && /USDT\s+Tether USD\s+Free\s+1 USDT\s+10 USDT/.test(usdt), usdt);
  check('says who pays which fee', /maker rate/.test(await text('.info-notes')) && /taken from what you receive/i.test(await text('.info-notes')));
  check('marked undesigned', /Not drawn yet/.test(await text('.undesigned-note')));

  // A failed load says so and offers a retry (in-app, since a reload would clear the switch)
  await page.goto(`${base}/markets`);
  await page.waitForSelector('.app-footer');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => (await import('/src/models/api/mock/server.js')).failNextRequest());
  await page.click('.app-footer a:has-text("Fees")');
  await page.waitForSelector('.error-state');
  check('a failed load says so', /fees didn't load/.test(await text('.error-state')));
  await page.click('.error-state button:has-text("Try again")');
  await page.waitForSelector('.info-table tbody tr');
  check('and can be tried again', (await tables.nth(0).locator('tbody tr').count()) === 4);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  check('tables scroll inside their panels', await page.evaluate(() => [...document.querySelectorAll('.info-panel .table-wrap')].every((w) => w.scrollWidth > w.clientWidth && w.getBoundingClientRect().right <= 390)));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
