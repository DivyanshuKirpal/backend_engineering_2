// Drives Orders: the tabs, the drawer and the address bar, filters, cancels.
import { join } from 'node:path';
import { start } from './harness.mjs';

const { page, base, shots, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const rows = (tab) => page.locator(`.orders-${tab} tbody tr:not(:has(.table-empty))`);
const drawer = '.order-drawer';
const A512 = '66f3c1b4e8d27a3f0b6ca512';
const A512_FILL = '66f3c1c7f1a8e2d4b093a64e';
const A2A3C = '66f1a9e3c7d2b4f8a06e2a3c';
const path = () => new URL(page.url()).pathname + new URL(page.url()).search;

try {
  await signIn('demo');
  const ids = await page.evaluate(async () => {
    const { db } = await import('/src/models/api/mock/db.js');
    return db().orders.filter((o) => o.userId === '66f19a3c5e7b2d4f8a1c0e01').map((o) => o.id);
  });
  check('demo order ids', ids.includes(A512) && ids.includes(A2A3C), JSON.stringify(ids));

  await page.goto(`${base}/orders`);
  await page.waitForSelector('.orders-open tbody tr');
  check('open tab by default', (await page.getAttribute('.tab:has-text("Open")', 'aria-selected')) === 'true');
  check('four open orders', (await rows('open').count()) === 4 && (await text('.tab:has-text("Open") .tab-count')) === '4');
  await page.waitForFunction(() => !/Pending/.test(document.querySelector('.orders-open tbody')?.textContent ?? ''), null, { timeout: 5000 });
  check('the pending order goes on the book', /Open/.test(await text('.orders-open tbody tr')));

  // The drawer from a link, then Escape steps back
  await page.click(`.orders-open a[href*="${A512}"]`);
  await page.waitForSelector(`${drawer} .order-headline`);
  check('link opens the drawer', path() === `/orders?tab=open&order=${A512}`, path());
  check('drawer headline', (await text(`${drawer} .order-headline`)) === '0.02500 BTC at 62,400.00');
  const facts = await text(`${drawer} .order-facts`);
  check('drawer facts', /Average fill\s+62,400\.00/.test(facts) && /Received so far\s+623\.500800 USDT/.test(facts) && /Fee paid\s+0\.499200 USDT · maker/.test(facts) && /Still locked\s+0\.01500000 BTC/.test(facts), facts);
  check('drawer progress', (await text(`${drawer} .order-progress-label`)) === '0.01000 of 0.02500 filled');
  check('drawer lifecycle', (await page.locator(`${drawer} .timeline-item`).count()) === 4 && /Waiting\. 0\.01500 BTC left\./.test(await text(`${drawer} .timeline`)));
  check('drawer ledger', (await page.locator(`${drawer} .ledger-table tbody tr`).count()) === 4 && /trade_fee\s+USDT\s+−0\.499200\s+—/.test(await text(`${drawer} .ledger-table`)));
  check('cancel the rest', (await text(`${drawer} .order-cancel .btn`)) === 'Cancel the remaining 0.01500 BTC');
  check('row lit', (await page.locator('.orders-open tr.current').count()) === 1);
  check('focus in the drawer', await page.evaluate(() => Boolean(document.activeElement?.closest('.order-drawer'))));
  await page.keyboard.press('Escape');
  await page.waitForSelector(drawer, { state: 'detached' });
  check('escape closes and steps back', path() === '/orders', path());
  check('focus back on the link', await page.evaluate((id) => document.activeElement?.getAttribute('href')?.includes(id), A512));

  // Back and Forward follow the drawer
  await page.click(`.orders-open a[href*="${A512}"]`);
  await page.waitForSelector(`${drawer} .order-headline`);
  await page.goBack();
  await page.waitForSelector(drawer, { state: 'detached' });
  check('back closes the drawer', path() === '/orders');
  await page.goForward();
  await page.waitForSelector(`${drawer} .order-headline`);
  check('forward opens it again', path().includes(A512));
  await page.click(`${drawer} .dialog-close`);
  await page.waitForSelector(drawer, { state: 'detached' });
  check('close button steps back', path() === '/orders', path());

  // Filters
  await page.selectOption('#orders-market', 'ETH-USDT');
  await page.waitForFunction(() => document.querySelectorAll('.orders-open tbody tr').length === 1);
  check('market filter', /ETH\/USDT/.test(await text('.orders-open tbody tr')));
  await page.selectOption('#orders-market', 'all');
  await page.selectOption('#orders-side', 'sell');
  await page.waitForFunction(() => document.querySelectorAll('.orders-open tbody tr').length === 1);
  check('side filter', /66F3·A512/.test(await text('.orders-open tbody tr')));
  await page.selectOption('#orders-side', 'all');
  await page.waitForFunction(() => document.querySelectorAll('.orders-open tbody tr').length === 4);

  // Cancel one, from its row
  await page.click('.orders-open tbody tr:has-text("ETH/USDT") button:has-text("Cancel")');
  await page.waitForSelector('.toast:has-text("Cancel requested")');
  await page.waitForFunction(() => document.querySelectorAll('.orders-open tbody tr').length === 3, null, { timeout: 8000 });
  check('cancelled order leaves the open tab', (await text('.tab:has-text("Open") .tab-count')) === '3');

  // Cancel all on BTC/USDT, after a confirmation
  await page.selectOption('#orders-market', 'BTC-USDT');
  await page.click('.cancel-all');
  await page.waitForSelector('.dialog-confirm');
  check('confirm names the orders', (await text('.dialog-confirm .dialog-title')) === 'Cancel all 3 open BTC/USDT orders?', await text('.dialog-confirm .dialog-title'));
  await page.click('.dialog-confirm button:has-text("Keep them")');
  await page.waitForSelector('.dialog-confirm', { state: 'detached' });
  check('keep them leaves them', (await rows('open').count()) === 3);
  await page.click('.cancel-all');
  await page.click('.dialog-confirm button:has-text("Cancel them")');
  await page.waitForSelector('.dialog-confirm', { state: 'detached' });
  await page.waitForSelector('.orders-open .empty-state', { timeout: 8000 });
  check('all cancelled', /No open orders match these filters/.test(await text('.orders-open')));
  await page.selectOption('#orders-market', 'all');
  await page.waitForSelector('.orders-open .empty-state a[href^="/trade/"]');
  check('empty open tab offers Trade', true);

  // History: the closed orders, and a cancelled one in the drawer
  await page.click('.tab:has-text("History")');
  await page.waitForSelector('.orders-history tbody tr');
  check('history tab in the address', path() === '/orders?tab=history');
  check('seven closed orders', (await rows('history').count()) === 7, String(await rows('history').count()));
  const a512Row = await text(`.orders-history tbody tr:has(a[href*="${A512}"])`);
  check('part-filled then cancelled', /0\.01000 BTC[\s\S]*Cancelled[\s\S]*You cancelled it/.test(a512Row), a512Row);
  await page.click(`.orders-history a[href*="${A512}"]`);
  await page.waitForSelector(`${drawer} .timeline`);
  const life = await text(`${drawer} .timeline`);
  check('drawer tells the cancel', /Cancelled\. You cancelled it\. 0\.01500 BTC went back to free\./.test(life), life);
  check('no cancel button once closed', (await page.locator(`${drawer} .order-cancel`).count()) === 0);
  check('closed fact', /Cancelled\s+\d{2} \w{3} \d{2}:\d{2}/.test(await text(`${drawer} .order-facts`)));
  await page.keyboard.press('Escape');
  await page.waitForSelector(drawer, { state: 'detached' });

  // A trade link opens the order it filled; Close keeps you on Trades
  await page.goto(`${base}/orders?tab=trades&trade=${A512_FILL}`);
  await page.waitForSelector(`${drawer} .order-headline`);
  check('trade link opens its order', path() === `/orders?tab=trades&order=${A512}`, path());
  check('trade row lit', /Maker/.test(await text('.orders-trades tr.current')));
  await page.click(`${drawer} .dialog-close`);
  await page.waitForSelector(drawer, { state: 'detached' });
  check('close stays on trades', path() === '/orders?tab=trades', path());

  // An untabbed link to a filled order lands on History
  await page.goto(`${base}/orders?order=${A2A3C}`);
  await page.waitForSelector(`${drawer} .order-headline`);
  await page.waitForFunction(() => location.search.includes('tab=history'));
  check('filled order opens on History', path() === `/orders?tab=history&order=${A2A3C}`, path());
  check('filled lifecycle', /Matched on arrival\.[\s\S]*Filled\./.test(await text(`${drawer} .timeline`)));

  // The phone drawer scrolls to its ledger
  if (shots) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/orders?tab=history&order=${A512}`);
    await page.waitForSelector(`${drawer} .ledger-table`);
    await page.evaluate(() => { const d = document.querySelector('.order-drawer'); d.scrollTop = d.scrollHeight; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(shots, 'orders-drawer-390-bottom.png') });
    const fits = await page.evaluate(() => [...document.querySelectorAll('.order-drawer .ledger-table td')].every((td) => td.scrollWidth <= td.clientWidth + 1));
    check('phone ledger fits', fits);
  }
} catch (err) {
  fail(err);
} finally {
  await finish();
}
