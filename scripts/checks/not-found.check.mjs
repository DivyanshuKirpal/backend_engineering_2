// Drives the 404: what it says, its ways back, and long or odd addresses.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

try {
  await signIn('guest');
  await page.goto(`${base}/no-such-page`);
  await page.waitForSelector('.empty-state-page');
  check('says so', /This page doesn't exist/.test(await text('.empty-state-page')) && (await text('h1')) === 'This page doesn\'t exist');
  check('names the address', (await text('.empty-state-page code')) === '/no-such-page');
  check('title', (await page.title()) === 'Page not found · Orichal', await page.title());
  check('in the public layout', (await page.locator('.app-header').count()) === 1 && (await page.locator('.app-footer').count()) === 1);
  check('marked undesigned', /Not drawn yet/.test(await text('.undesigned-note')));
  await page.click('.empty-state-actions a:has-text("Go to markets")');
  await page.waitForURL('**/markets');
  check('way back to markets', true);
  await page.goBack();
  await page.waitForSelector('.empty-state-page');
  await page.click('.empty-state-actions a:has-text("Home")');
  await page.waitForFunction(() => location.pathname === '/');
  check('way back home', true);

  // Under a real section, and with markup in the address
  await page.goto(`${base}/wallet/nope/deeper`);
  await page.waitForSelector('.empty-state-page');
  check('a deeper unknown path', (await text('.empty-state-page code')) === '/wallet/nope/deeper');
  await page.goto(`${base}/%3Cb%3Ebold%3C/b%3E`);
  await page.waitForSelector('.empty-state-page');
  check('markup in the address stays text', (await page.locator('.empty-state-page b').count()) === 0);

  // Signed in, it's the same page
  await signIn('demo');
  await page.goto(`${base}/no-such-page`);
  await page.waitForSelector('.user-chip');
  check('signed in too', (await page.locator('.empty-state-page').count()) === 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/no-such-page`);
  await page.waitForSelector('.empty-state-page');
  check('no sideways scroll on phones', await noSideways());
  await page.goto(`${base}/${'x'.repeat(90)}`);
  await page.waitForSelector('.empty-state-page');
  check('a long address without breaks wraps', await noSideways());
} catch (err) {
  fail(err);
} finally {
  await finish();
}
