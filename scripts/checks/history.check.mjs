// Drives History: the ledger's paging and filters, the tabs, and a withdrawal.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const wait = (ms) => page.waitForTimeout(ms);
const rows = () => page.locator('.ledger-history tbody tr').count();
const settle = () => page.waitForFunction(() => !document.querySelector('.history-panel .skeleton'));

try {
  await signIn('demo');
  await page.goto(`${base}/wallet/history`);
  await page.waitForSelector('.ledger-history tbody tr');
  check('ledger by default', (await page.getAttribute('.tab:has-text("Ledger")', 'aria-selected')) === 'true');
  check('13 rows', (await rows()) === 13);
  check('13 of 21', /13 of 21 shown/.test(await text('.history-foot')));
  check('first row is the newest lock', /order_lock\s+USDT\s+−620\.000000\s+\+620\.000000\s+1,616\.000800\s+5,207\.500000\s+Order 66F3·A91C/.test(await text('.ledger-history tbody tr')), await text('.ledger-history tbody tr'));
  check('order link', (await page.getAttribute('.ledger-history tbody tr .link', 'href')).startsWith('/orders?order='));

  await page.click('.history-foot .btn');
  await page.waitForFunction(() => document.querySelectorAll('.ledger-history tbody tr').length === 21);
  check('21 after loading older', /21 of 21 shown/.test(await text('.history-foot')) && (await page.locator('.history-foot .btn').count()) === 0);
  check('oldest is the sign-up credit', /demo_credit\s+USDT\s+\+10,000\.000000[\s\S]*Sign-up credit/.test(await page.locator('.ledger-history tbody tr').last().innerText()), await page.locator('.ledger-history tbody tr').last().innerText());

  await page.selectOption('#ledger-asset', 'BTC');
  await settle();
  await wait(300);
  const btc = await page.locator('.ledger-history tbody tr td.col-asset').allInnerTexts();
  check('BTC only', btc.length > 0 && btc.every((a) => a === 'BTC'), JSON.stringify(btc));
  await page.selectOption('#ledger-group', 'trades');
  await settle();
  await wait(300);
  const types = await page.locator('.ledger-history tbody tr td.col-type').allInnerTexts();
  check('BTC trades and fees', types.length > 0 && types.every((t) => t.startsWith('trade_')), JSON.stringify(types));
  await page.selectOption('#ledger-group', 'credit');
  await settle();
  await wait(300);
  check('no match message', /No entries match these filters/.test(await text('.ledger-history tbody')));

  // Deposits tab
  await page.click('.tab:has-text("Deposits")');
  await page.waitForURL('**/wallet/history?tab=deposits');
  await page.waitForSelector('.transactions-deposits tbody tr');
  check('one deposit', /USDT\s+\+2,000\.00\s+Simulated/.test(await text('.transactions-deposits tbody tr')), await text('.transactions-deposits tbody tr'));
  await page.goBack();
  await page.waitForSelector('.ledger-history');
  check('back to the ledger', (await page.getAttribute('.tab:has-text("Ledger")', 'aria-selected')) === 'true');

  // A withdrawal, then its tab
  await page.evaluate(async () => {
    const api = await import('/src/models/api/wallet.api.js');
    await api.withdraw({ asset: 'USDT', amount: '50', address: 'sim-usdt-c41e09ab77d2f310', code: '123456' });
  });
  await page.goto(`${base}/wallet/history?tab=withdrawals`);
  await page.waitForSelector('.transactions-withdrawals tbody tr');
  check('pending withdrawal', /USDT\s+−50\.00\s+1\.00\s+49\.00[\s\S]*Pending/.test(await text('.transactions-withdrawals tbody tr')), await text('.transactions-withdrawals tbody tr'));
  await page.click('.transactions-withdrawals tbody tr button:has-text("Cancel")');
  await page.waitForSelector('.toast:has-text("Withdrawal cancelled")');
  await page.waitForFunction(() => /Cancelled/.test(document.querySelector('.transactions-withdrawals tbody tr')?.textContent ?? ''));
  check('cancelled in the list', true);
} catch (err) {
  fail(err);
} finally {
  await finish();
}
