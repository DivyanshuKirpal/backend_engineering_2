// Drives Admin · Markets: editing fees and minimums, halting (with and without
// cancelling open orders) and resuming, tick and step changes only while
// halted with no open orders, a halt reaching Markets and Trade, and the
// create form's rules with nothing to create yet.
import { start } from './harness.mjs';

const { page, base, shots, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const row = (pair) => text(`.market-admin-table tbody tr:has-text("${pair}")`);
const fieldError = (key) => page.locator(`#market-${key}-error`).innerText().catch(() => '');
// The demo trader's open ETH buy (66F3·A3B8)
const ethOrder = () => page.evaluate(async () => {
  const { db } = await import('/src/models/api/mock/db.js');
  const o = db().orders.find((x) => x.id === '66f3c1a9d0e35b8c4f72a3b8');
  return o ? `${o.status} ${o.cancelReason ?? ''}`.trim() : 'none';
});
// Price levels people's open ETH orders make: what stays on a halted book
const peopleLevels = () => page.evaluate(async () => {
  const { db } = await import('/src/models/api/mock/db.js');
  return new Set(db().orders.filter((o) => o.market === 'ETH-USDT' && ['open', 'partially_filled'].includes(o.status)).map((o) => `${o.side} ${o.price}`)).size;
});
const toAdmin = async () => {
  await page.goto(`${base}/admin/markets`);
  await page.waitForSelector('.market-admin-table tbody tr');
};
const confirmWith = async (button, { cancelOrders = false } = {}) => {
  await page.waitForSelector('.dialog-confirm');
  if (cancelOrders) await page.check('#halt-cancel-orders');
  await page.click(`.dialog-confirm button:has-text("${button}")`);
  await page.waitForSelector('.dialog-confirm', { state: 'detached' });
};
const editField = async (pair, values) => {
  await page.click(`button[aria-label="Edit ${pair}"]`);
  await page.waitForSelector('.market-form-dialog');
  for (const [key, value] of Object.entries(values)) await page.fill(`#market-${key}`, value);
  await page.click('.market-form-dialog button[type="submit"]');
};

try {
  await signIn('admin');
  await page.waitForTimeout(2500);
  await toAdmin();
  check('four markets', (await page.locator('.market-admin-table tbody tr').count()) === 4);
  check('btc fees and limits', /BTC\/USDT\s+Open\s+0\.08%\s+0\.10%\s+5 USDT\s+0\.00001 BTC\s+0\.01\s+0\.00001/.test(await row('BTC/USDT')), await row('BTC/USDT'));
  check('bnb halted, with Resume', /Halted/.test(await row('BNB/USDT')) && (await page.locator('button[aria-label="Resume BNB/USDT"]').count()) === 1);
  check('topbar', (await text('.admin-subtitle')) === '4 markets · 1 halted · every one quoted in USDT' && (await page.getAttribute('.admin-nav a[aria-current="page"]', 'href')) === '/admin/markets');
  check('says why nothing can be created', /Nothing to create yet/.test(await text('.market-create-note')) && /BTC, ETH, SOL, BNB\) already has one/.test(await text('.market-create-note')));
  check('marked undesigned', /Not drawn yet/.test(await text('.undesigned-note')));

  // Fees and minimums: refused when wrong, then saved
  await editField('BTC/USDT', { makerFeeRate: '150', minQty: '0.000015' });
  check('a fee over 100% refused', /from 0% to under 100%/.test(await fieldError('makerFeeRate')));
  check('a smallest amount off the step refused', /multiple of the amount step, 0\.00001/.test(await fieldError('minQty')));
  check('tick and step locked while open', await page.isDisabled('#market-tickSize') && /Halt the market to change this/.test(await text('.market-form-dialog')));
  await page.fill('#market-makerFeeRate', '0.05');
  await page.fill('#market-minQty', '0.00001');
  await page.fill('#market-minNotional', '10');
  await page.click('.market-form-dialog button[type="submit"]');
  await page.waitForSelector('.toast:has-text("BTC/USDT updated")');
  check('saved, and says what changed', /Maker fee and smallest order changed\. New trades use the new fees\./.test(await text('.toast:has-text("BTC/USDT updated")')));
  await page.waitForFunction(() => /0\.05%[\s\S]*10 USDT/.test(document.querySelector('.market-admin-table tbody tr')?.textContent ?? ''));
  check('the table follows', true);
  await page.goto(`${base}/fees`);
  await page.waitForSelector('.info-table tbody tr');
  check('Fees shows the new fee', /BTC\/USDT\s+0\.05%\s+0\.10%\s+10 USDT/.test(await text('.info-table tbody tr')), await text('.info-table tbody tr'));

  // Halt ETH and keep its orders: tick and step stay locked
  await toAdmin();
  await page.click('button[aria-label="Halt ETH/USDT"]');
  check('halt explains itself', /pulls its ladder/.test(await text('.dialog-confirm')) && !(await page.isChecked('#halt-cancel-orders')));
  await confirmWith('Halt market');
  await page.waitForSelector('.toast:has-text("ETH/USDT halted")');
  await page.waitForSelector('button[aria-label="Resume ETH/USDT"]');
  check('halted, orders kept', /Halted/.test(await row('ETH/USDT')) && (await ethOrder()) === 'open', await ethOrder());
  await editField('ETH/USDT', { tickSize: '0.05' });
  check('the tick must be a power of ten', /power of ten/.test(await fieldError('tickSize')));
  await page.fill('#market-tickSize', '0.1');
  await page.click('.market-form-dialog button[type="submit"]');
  await page.waitForFunction(() => /no open orders/.test(document.querySelector('#market-tickSize-error')?.textContent ?? ''));
  check('no tick change with open orders', true);
  await page.click('.market-form-dialog button:has-text("Close")');

  // The halt reaches Markets and Trade, in the same session and after a reload
  await page.click('.admin-back');
  await page.waitForSelector('.market-row');
  check('Markets shows it halted', /Halted/.test(await text('.market-row:has-text("ETH/USDT")')));
  await page.click('.market-row:has-text("ETH/USDT") a.market-link');
  await page.waitForSelector('.market-banner');
  await page.waitForTimeout(800);
  check('Trade shows the halt', /ETH\/USDT is halted/.test(await text('.market-banner')) && /Market halted/.test(await text('.ticket-submit')));
  const levels = await peopleLevels();
  check('the ladder is gone, people\'s orders stay', levels > 0 && (await page.locator('.ladder-row-ask').count()) === 0 && (await page.locator('.ladder-row-bid').count()) === levels, String(levels));
  await page.reload();
  await page.waitForSelector('.market-banner');
  await page.waitForTimeout(800);
  check('still halted after a reload', (await page.locator('.ladder-row-ask').count()) === 0 && (await page.locator('.ladder-row-bid').count()) === levels);

  // Resume brings the book back
  await toAdmin();
  await page.click('button[aria-label="Resume ETH/USDT"]');
  await confirmWith('Resume');
  await page.waitForSelector('.toast:has-text("ETH/USDT resumed")');
  await page.goto(`${base}/trade/ETH-USDT`);
  await page.waitForSelector('.ladder-row-ask');
  await page.waitForTimeout(800);
  check('resumed: the book is back', (await page.locator('.market-banner').count()) === 0 && (await page.locator('.ladder-row-ask').count()) >= 5 && (await page.locator('.ladder-row-bid').count()) >= 5);

  // Halt with every order cancelled, then the tick and step can change
  await toAdmin();
  await page.click('button[aria-label="Halt ETH/USDT"]');
  await confirmWith('Halt market', { cancelOrders: true });
  await page.waitForSelector('.toast:has-text("Every open order on it was cancelled")');
  check('open orders cancelled as market_halted', (await ethOrder()) === 'cancelled market_halted', await ethOrder());
  await editField('ETH/USDT', { tickSize: '0.1', stepSize: '0.001' });
  check('the smallest amount must fit the new step', /multiple of the amount step, 0\.001/.test(await fieldError('minQty')));
  if (shots) await page.screenshot({ path: `${shots}/admin-markets-edit-1440.png` });
  await page.fill('#market-minQty', '0.001');
  await page.click('.market-form-dialog button[type="submit"]');
  await page.waitForSelector('.toast:has-text("ETH/USDT updated")');
  await page.waitForFunction(() => /0\.1\s+0\.001/.test(document.querySelector('.market-admin-table tbody tr:nth-child(2)')?.innerText ?? ''));
  check('tick and step changed while halted', true);
  await page.click('button[aria-label="Resume ETH/USDT"]');
  await confirmWith('Resume');
  await page.waitForSelector('.toast:has-text("ETH/USDT resumed")');
  // In the app, not by reloading, so the running simulator is the one that changed
  await page.click('.admin-back');
  await page.waitForSelector('.market-row');
  await page.click('.market-row:has-text("ETH/USDT") a.market-link');
  await page.waitForSelector('.ladder-row-ask');
  await page.waitForTimeout(800);
  const prices = await page.locator('.ladder-row-ask .ladder-price').allInnerTexts();
  check('the book trades on the new tick', prices.length >= 5 && prices.every((p) => /^\d,\d{3}\.\d$/.test(p.trim())), JSON.stringify(prices.slice(0, 3)));
  const near = await page.evaluate(async () => {
    const { best } = await import('/src/models/api/mock/market.js');
    const { ask } = best('ETH-USDT');
    return Math.abs(Number(ask) / 3000 - 1) < 0.05;
  });
  check('around the old price', near);

  // The create form, with nothing to create
  await toAdmin();
  await page.click('button:has-text("New market")');
  await page.waitForSelector('.market-form-dialog');
  check('quoted in USDT', (await page.inputValue('#market-quoteAsset')) === 'USDT' && await page.isDisabled('#market-quoteAsset'));
  await page.fill('#market-tickSize', '0.05');
  await page.click('.market-form-dialog button[type="submit"]');
  check('create refused: no free asset', /Every asset already has a USDT market/.test(await fieldError('baseAsset')) && /power of ten/.test(await fieldError('tickSize')));
  await page.keyboard.press('Escape');
  const api = await page.evaluate(async () => {
    const adminApi = await import('/src/models/api/admin.api.js');
    const body = { tickSize: '0.01', stepSize: '0.00001', minQty: '0.00001', minNotional: '5', makerFeeRate: '0.0008', takerFeeRate: '0.001' };
    const tryIt = async (extra) => {
      try {
        await adminApi.createMarket({ ...body, ...extra });
        return 'created';
      } catch (err) {
        return `${err.status} ${err.code} ${JSON.stringify(err.details ?? {})}`;
      }
    };
    return {
      taken: await tryIt({ symbol: 'BTC-USDT', baseAsset: 'BTC', quoteAsset: 'USDT' }),
      quote: await tryIt({ symbol: 'SOL-BTC', baseAsset: 'SOL', quoteAsset: 'BTC' }),
      unknown: await tryIt({ symbol: 'DOGE-USDT', baseAsset: 'DOGE', quoteAsset: 'USDT' }),
    };
  });
  check('the API refuses a pair that exists', api.taken.startsWith('409 CONFLICT'), api.taken);
  check('the API wants USDT quotes', api.quote.startsWith('400 VALIDATION_ERROR') && /"quoteAsset":"quote"/.test(api.quote), api.quote);
  check('the API wants a real asset', /"baseAsset":"unknown"/.test(api.unknown), api.unknown);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.click('button[aria-label="Edit BTC/USDT"]');
  await page.waitForSelector('.market-form-dialog');
  check('the form fits a phone', await page.evaluate(() => document.querySelector('.market-form-dialog').getBoundingClientRect().right <= 390));
  if (shots) await page.screenshot({ path: `${shots}/admin-markets-edit-390.png` });
} catch (err) {
  fail(err);
} finally {
  await finish();
}
