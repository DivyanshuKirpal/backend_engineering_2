// Drives the Deposit page: asset choice, address and QR, validation, a deposit.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start({ permissions: ['clipboard-read', 'clipboard-write'] });
const text = (sel) => page.locator(sel).first().innerText();
const wait = (ms) => page.waitForTimeout(ms);

try {
  await signIn('demo');

  await page.goto(`${base}/wallet/deposit`);
  await page.waitForSelector('.address-text');
  check('USDT by default', (await page.inputValue('#deposit-asset')) === 'USDT');
  check('USDT address shape', /^sim-usdt-[0-9a-f]{16}$/.test(await text('.address-text')), await text('.address-text'));
  check('QR drawn', (await page.locator('.qr path').getAttribute('d')).length > 500);
  check('card tab offered for USDT', !(await page.isDisabled('.deposit-methods .tab:has-text("Card")')));

  // Switch asset with the select
  await page.selectOption('#deposit-asset', 'BTC');
  await page.waitForURL('**/wallet/deposit?asset=BTC');
  await page.waitForFunction(() => document.querySelector('.address-text')?.textContent.startsWith('sim-btc-'));
  check('BTC address is the seeded one', (await text('.address-text')) === 'sim-btc-7f3a91c2e6b04d58', await text('.address-text'));
  check('card tab off for BTC', await page.isDisabled('.deposit-methods .tab:has-text("Card")'));
  check('limit note', /Up to 1 BTC per deposit/.test(await text('.deposit-form .field-hint')));

  // Copy
  await page.click('.address-copy');
  check('copied', (await page.evaluate(() => navigator.clipboard.readText())) === 'sim-btc-7f3a91c2e6b04d58');

  // Validation
  await page.click('.deposit-submit');
  check('empty amount', /Enter an amount/.test(await text('.deposit-form .field-error')));
  await page.fill('#deposit-amount', '1.5');
  await page.click('.deposit-submit');
  check('over the limit', /at most 1 BTC/.test(await text('.deposit-form .field-error')), await text('.deposit-form .field-error'));
  await page.fill('#deposit-amount', '0.123456789');
  await page.click('.deposit-submit');
  check('too many decimals', /at most 8 decimals/.test(await text('.deposit-form .field-error')));

  // A deposit
  await page.fill('#deposit-amount', '0.25');
  await page.click('.deposit-submit');
  await page.waitForSelector('.toast');
  check('toast', /0\.25000000 BTC is in your wallet/.test(await text('.toast')), await text('.toast'));
  check('amount cleared', (await page.inputValue('#deposit-amount')) === '');
  await wait(900);
  check('recent list shows it first', /BTC\s*\+0\.25000000/.test(await text('.recent-row')), await text('.recent-row'));
  const btc = await page.evaluate(async () => (await import('/src/models/stores/balance.store.js')).freeByAsset().BTC);
  check('balance rose to 0.28743750', btc === '0.28743750', btc);

  // Back goes to the previous asset
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('#deposit-asset')?.value === 'USDT');
  check('back follows ?asset=', (await page.inputValue('#deposit-asset')) === 'USDT');

  // Card tab
  await page.click('.deposit-methods .tab:has-text("Card")');
  check('card tab explains itself', /needs the backend/.test(await text('.card-deposit')));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
