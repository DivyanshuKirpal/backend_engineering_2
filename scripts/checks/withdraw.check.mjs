// Drives the Withdraw page: validation, Max, confirm, 2FA, cancel, KYC gate.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const wait = (ms) => page.waitForTimeout(ms);
const errorsIn = () => page.locator('.withdraw-form .field-error').allInnerTexts();
const freeUsdt = () => page.evaluate(async () => (await import('/src/models/stores/balance.store.js')).freeByAsset().USDT);

try {
  await signIn('demo');
  await page.goto(`${base}/wallet/withdraw`);
  await page.waitForSelector('.withdraw-form');
  check('identity card', /Identity verified/.test(await text('.kyc-card')));
  check('free USDT', /Free 1,616.00 USDT/.test(await text('.withdraw-free')), await text('.withdraw-free'));
  check('fees table', (await page.locator('.fees-table tbody tr').count()) === 5);

  await page.click('.withdraw-submit');
  let errs = await errorsIn();
  check('three errors', errs.length === 3 && errs.some((e) => /address to send/.test(e)) && errs.some((e) => /Enter an amount/.test(e)) && errs.some((e) => /6-digit code/.test(e)), JSON.stringify(errs));
  await page.fill('#withdraw-address', 'sim-btc-7f3a91c2e6b04d58');
  await page.fill('#withdraw-amount', '5');
  errs = await errorsIn();
  check('wrong asset address', errs.some((e) => /simulated USDT address/.test(e)), JSON.stringify(errs));
  check('below minimum', errs.some((e) => /minimum is 10 USDT/.test(e)), JSON.stringify(errs));
  await page.fill('#withdraw-amount', '2000');
  check('over the free balance', (await errorsIn()).some((e) => /You have 1,616.00 USDT free/.test(e)));
  await page.click('.max-btn');
  check('max fills the free amount', (await page.inputValue('#withdraw-amount')) === '1616.00', await page.inputValue('#withdraw-amount'));

  await page.fill('#withdraw-address', 'sim-usdt-c41e09ab77d2f310');
  await page.fill('#withdraw-amount', '500');
  check('summary', /Leaves your wallet\s*500\.00 USDT/.test(await text('.withdraw-summary')) && /They receive\s*499\.00 USDT/.test(await text('.withdraw-summary')), await text('.withdraw-summary'));
  check('button names the amount', (await text('.withdraw-submit')) === 'Request withdrawal of 500.00 USDT');

  // Wrong code: the server refuses
  await page.fill('#withdraw-code', '111111');
  await page.click('.withdraw-submit');
  await page.waitForSelector('.dialog-confirm');
  check('confirm says what they get', /499\.00 USDT goes to sim-usdt-c41e…f310/.test(await text('.dialog-confirm')), await text('.dialog-confirm'));
  await page.click('.dialog-confirm .btn-primary');
  await page.waitForFunction(() => /didn't work/.test(document.querySelector('.withdraw-code .field-error')?.textContent ?? ''));
  check('wrong code error', true);
  check('nothing locked', (await freeUsdt()) === '1616.000800');

  // Right code
  await page.fill('#withdraw-code', '123456');
  await page.click('.withdraw-submit');
  await page.waitForSelector('.dialog-confirm');
  await page.click('.dialog-confirm .btn-primary');
  await page.waitForSelector('.toast:has-text("Withdrawal requested")');
  await wait(900);
  check('pending listed', /USDT\s*−500\.00/.test(await text('.recent-panel')), await text('.recent-panel'));
  check('500 locked', (await freeUsdt()) === '1116.000800', await freeUsdt());

  // Cancel it
  await page.click('.recent-panel .recent-row button:has-text("Cancel")');
  await page.waitForSelector('.toast:has-text("Withdrawal cancelled")');
  await wait(600);
  check('pending empty', /Nothing waiting for review/.test(await text('.recent-panel')));
  check('500 free again', (await freeUsdt()) === '1616.000800', await freeUsdt());

  // ?asset=BTC
  await page.goto(`${base}/wallet/withdraw?asset=BTC`);
  await page.waitForSelector('.withdraw-form');
  check('BTC picked', (await page.inputValue('#withdraw-asset')) === 'BTC' && /0\.03743750 BTC/.test(await text('.withdraw-free')), await text('.withdraw-free'));

  // A new account without KYC
  await page.evaluate(async () => (await import('/src/presenters/shared/session.presenter.js')).endUser());
  await page.evaluate(async () => {
    const auth = await import('/src/models/api/auth.api.js');
    const sp = await import('/src/presenters/shared/session.presenter.js');
    sp.startUser(await auth.register({ email: `nokyc${Date.now() % 100000}@example.com`, password: 'OrichalDemoPass-26', displayName: 'No KYC' }));
  });
  await page.goto(`${base}/wallet/withdraw`);
  await page.waitForSelector('.kyc-notice');
  check('KYC gate', /Verify your identity to withdraw/.test(await text('.kyc-notice')) && (await page.locator('.withdraw-form').count()) === 0);
} catch (err) {
  fail(err);
} finally {
  await finish();
}
