// Drives the Wallet page: numbers, hide small balances, links, live updates.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const wait = (ms) => page.waitForTimeout(ms);

try {
  await signIn('demo');
  await page.goto(`${base}/wallet`);
  await page.waitForSelector('.balances-table tbody tr');
  await wait(500);
  check('five rows', (await page.locator('.balances-table tbody tr').count()) === 5);
  check('USDT free 1,616.00', (await text('.balances-table tbody tr:first-child .col-free')) === '1,616.00');
  check('BTC total', (await text('.balances-table tbody tr:nth-child(2) .col-total')) === '0.05243750');
  check('BNB withdraw is not a link', (await page.locator('.balances-table tbody tr:nth-child(5) a:has-text("Withdraw")').count()) === 0);
  check('BTC withdraw link', (await page.getAttribute('.balances-table tbody tr:nth-child(2) a:has-text("Withdraw")', 'href')) === '/wallet/withdraw?asset=BTC');
  check('USDT trade goes to the last market', /^\/trade\/[A-Z]+-USDT$/.test(await page.getAttribute('.balances-table tbody tr:first-child a:has-text("Trade")', 'href')));
  check('legend has four assets', (await page.locator('.allocation-item').count()) === 4);

  // Hide small balances
  await page.click('#hide-small');
  await wait(600);
  check('BNB hidden', (await page.locator('.balances-table tbody tr').count()) === 4);
  check('hidden note', /1 small balance is hidden/.test(await text('.balances-hidden')));
  await page.reload();
  await page.waitForSelector('.balances-table tbody tr');
  await wait(500);
  check('choice kept after reload', (await page.locator('.balances-table tbody tr').count()) === 4 && await page.isChecked('#hide-small'));
  const saved = await page.evaluate(async () => {
    const { db } = await import('/src/models/api/mock/db.js');
    return db().users.find((u) => u.email === 'demo@orichal.app').preferences.hideSmallBalances;
  });
  check('saved on the account', saved === true);
  await page.click('#hide-small');
  await wait(600);

  // Live: an order locks USDT, held rises and free falls
  const heldBefore = await text('.wallet-split > div:nth-child(2) .wallet-split-amount');
  await page.evaluate(async () => {
    const api = await import('/src/models/api/order.api.js');
    await api.place({ market: 'BTC-USDT', side: 'buy', type: 'limit', price: '50000.00', quantity: '0.01000' });
  });
  await wait(1500);
  const heldAfter = await text('.wallet-split > div:nth-child(2) .wallet-split-amount');
  check('held rose by 500.00', Number(heldAfter.replace(/,/g, '')) - Number(heldBefore.replace(/,/g, '')) === 500, `${heldBefore} -> ${heldAfter}`);
  check('USDT free 1,116.00', (await text('.balances-table tbody tr:first-child .col-free')) === '1,116.00', await text('.balances-table tbody tr:first-child .col-free'));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
