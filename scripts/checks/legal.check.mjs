// Drives Legal: the terms, privacy and risk pages, and an unknown one.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();

try {
  await signIn('guest');

  // Reached from the footer
  await page.click('.app-footer a:has-text("Terms of use")');
  await page.waitForSelector('.legal-doc h2');
  check('terms from the footer', new URL(page.url()).pathname === '/legal/terms' && (await page.title()) === 'Terms of use · Orichal', await page.title());
  check('says it is a simulator', /simulator built for a course project/.test(await text('.legal-banner')));
  check('current link marked', (await page.getAttribute('.legal-nav a[aria-current="page"]', 'href')) === '/legal/terms');
  check('marked undesigned', /Not drawn yet/.test(await text('.undesigned-note')));
  await page.click('.legal-nav a:has-text("Risk notice")');
  await page.waitForFunction(() => location.pathname === '/legal/risk' && /Risk notice/.test(document.querySelector('h1')?.textContent ?? ''));
  check('risk notice', /No real money/.test(await text('.legal-doc')) && (await page.title()) === 'Risk notice · Orichal');
  await page.click('.legal-nav a:has-text("Privacy")');
  await page.waitForFunction(() => location.pathname === '/legal/privacy' && /Privacy/.test(document.querySelector('h1')?.textContent ?? ''));
  check('privacy lists what is kept', (await page.locator('.legal-doc li').count()) === 4);
  check('privacy says where the data lives', /local storage/.test(await text('.legal-doc')));
  await page.goBack();
  await page.waitForFunction(() => location.pathname === '/legal/risk' && /Risk notice/.test(document.querySelector('h1')?.textContent ?? ''));
  check('back returns to the risk notice', (await page.getAttribute('.legal-nav a[aria-current="page"]', 'href')) === '/legal/risk');

  await page.goto(`${base}/legal/nope`);
  await page.waitForSelector('.legal-doc');
  check('unknown legal page', /no legal page by that name/.test(await text('.legal-doc')) && (await page.locator('.legal-nav a[aria-current="page"]').count()) === 0);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of ['terms', 'privacy', 'risk']) {
    await page.goto(`${base}/legal/${slug}`);
    await page.waitForSelector('.legal-doc h2');
    check(`no sideways scroll on phones: ${slug}`, await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  }
} catch (err) {
  fail(err);
} finally {
  await finish();
}
