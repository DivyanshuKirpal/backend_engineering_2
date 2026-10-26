// Drives the Trade page like a user: ticket, ladder pick, percent buttons,
// placing and cancelling orders, intervals, market switch, halted market.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start({ viewport: { width: 1440, height: 920 } });
const text = (sel) => page.locator(sel).first().innerText();
const wait = (ms) => page.waitForTimeout(ms);

try {
  await signIn('demo');
  await page.goto(`${base}/trade/BTC-USDT`);
  await page.waitForSelector('.ticket');
  await wait(1500);
  check('title', (await page.title()).startsWith('BTC/USDT · Trade'), await page.title());
  check('h1 is the pair', (await text('h1')) === 'BTC/USDT');
  check('price seeded with last', /^\d{2},\d{3}\.\d{2}$/.test(await page.inputValue('#ticket-price')), await page.inputValue('#ticket-price'));
  await page.fill('#ticket-price', '62,140.50');

  // Percent: 75% of 1,616.00 USDT at 62,140.50
  await page.click('.share-btn:has-text("75%")');
  check('75% amount', (await page.inputValue('#ticket-amount')) === '0.01950', await page.inputValue('#ticket-amount'));
  check('75% lit', (await page.getAttribute('.share-btn:has-text("75%")', 'aria-pressed')) === 'true');
  check('total follows', (await page.inputValue('#ticket-total')) === '1,211.74', await page.inputValue('#ticket-total'));
  await page.fill('#ticket-amount', '0.02');
  check('75% unlit after typing', (await page.getAttribute('.share-btn:has-text("75%")', 'aria-pressed')) === 'false');
  check('total 1,242.81', (await page.inputValue('#ticket-total')) === '1,242.81', await page.inputValue('#ticket-total'));
  const engine = await text('.engine-text');
  check('engine says rest or take', /Rest at 62,140\.50|taker/.test(engine), engine);
  check('fee at most', (await text('.ticket-fee .t-mono')) === '0.00002000 BTC', await text('.ticket-fee .t-mono'));
  check('button label', (await text('.ticket-submit')) === 'Place buy · 0.02000 BTC', await text('.ticket-submit'));

  // Tick error, live
  await page.fill('#ticket-price', '62140.555');
  const errs = await page.locator('.field-error').allInnerTexts();
  check('tick error', errs.some((t) => /steps of 0\.01/.test(t)), JSON.stringify(errs));
  await page.fill('#ticket-price', '62,140.50');

  // Ladder click on the best ask fills the price
  const askPick = page.locator('.ladder-asks .ladder-row').last().locator('.ladder-pick');
  const bestAsk = await askPick.innerText();
  await askPick.click();
  check('ladder pick', (await page.inputValue('#ticket-price')) === bestAsk, `${await page.inputValue('#ticket-price')} vs ${bestAsk}`);
  const engine2 = await text('.engine-text');
  check('engine: take at the ask', /taker/.test(engine2), engine2);

  // Place a resting buy below the book
  await page.fill('#ticket-price', '61,000.00');
  await page.fill('#ticket-amount', '0.01');
  const behind = await text('.engine-text');
  check('engine: rests deeper', /Rest at 61,000\.00, \d+ levels below the best bid/.test(behind), behind);
  await page.click('.ticket-submit');
  await page.waitForSelector('.toast');
  check('toast placed', /Order placed/.test(await text('.toast')), await text('.toast'));
  check('amount cleared', (await page.inputValue('#ticket-amount')) === '');
  await wait(300);
  check('new chip picked', /Buy 0\.01 @ 61,000/.test(await text('.order-chip.current')), await text('.order-chip.current'));
  await wait(1800);
  const tl = await page.locator('.timeline-item').allInnerTexts();
  check('timeline placed + on book + waiting', tl.length === 3 && /On the book/.test(tl[1]) && /Waiting/.test(tl[2]), JSON.stringify(tl));
  const ledger = await page.locator('.ledger-table tbody tr').allInnerTexts();
  check('ledger order_lock 610 USDT', ledger.length === 1 && /order_lock\s+USDT\s+−610\.000000\s+\+610\.000000/.test(ledger[0]), JSON.stringify(ledger));
  check('free went down', (await text('.ticket-free-amount')) === '1,006.00', await text('.ticket-free-amount'));

  // Cancel it
  await page.click('.orders-cancel');
  await wait(2200);
  const tl2 = await page.locator('.timeline-item').allInnerTexts();
  check('timeline cancelled', /Cancelled\. You cancelled it\. 610\.00 USDT went back to free\./.test(tl2.at(-1) ?? ''), JSON.stringify(tl2));
  check('chip gone', !(await page.locator('.order-chip').allInnerTexts()).some((t) => t.includes('61,000')));
  check('free restored', (await text('.ticket-free-amount')) === '1,616.00', await text('.ticket-free-amount'));

  // A crossing buy, priced well over the best ask so a moving book still fills it
  await page.fill('#ticket-price', '62,600.00');
  await page.fill('#ticket-amount', '0.001');
  await page.click('.ticket-submit');
  await wait(2500);
  const tl3 = await page.locator('.timeline-item').allInnerTexts();
  check('taker fill timeline', tl3.some((t) => /You were the taker/.test(t)) && /Filled\./.test(tl3.join(' ')), JSON.stringify(tl3));
  const ledger3 = await page.locator('.ledger-table tbody tr').allInnerTexts();
  check('taker ledger has fee', ledger3.some((r) => r.startsWith('trade_fee')), JSON.stringify(ledger3));

  // Market buy, sell side switch
  await page.click('.tabs-underline .tab:has-text("Market")');
  check('price disabled on market', await page.isDisabled('#ticket-price'));
  await page.fill('#ticket-total', '50');
  const est = await page.inputValue('#ticket-amount');
  check('market buy estimate', est.startsWith('≈ 0.000'), est);
  await page.click('.ticket-sides .tab:has-text("Sell")');
  check('sell free in BTC', /BTC/.test(await text('.ticket-free')), await text('.ticket-free'));
  await page.click('.tabs-underline .tab:has-text("Limit")');

  // Intervals
  await page.click('.interval-btn:has-text("1h")');
  await wait(900);
  check('1h pressed', (await page.getAttribute('.interval-btn:has-text("1h")', 'aria-pressed')) === 'true');
  check('1h candles drawn', (await page.locator('.chart-candles g').count()) > 40);

  // Grouping
  await page.selectOption('#ladder-group', '10');
  await wait(200);
  const grouped = await page.locator('.ladder-bids .ladder-pick').first().innerText();
  check('grouped by 10', /^\d{2},\d{3}$/.test(grouped) && grouped.endsWith('0'), grouped);
  await page.selectOption('#ladder-group', '0.01');

  // Market switch
  await page.click('.market-switch-desk .market-switch');
  await page.fill('#market-menu-search', 'sol');
  check('switcher filters', (await page.locator('.market-menu-item').count()) === 1);
  await page.click('.market-menu-item');
  await page.waitForURL('**/trade/SOL-USDT');
  await page.waitForSelector('.ticket');
  await wait(800);
  check('switched to SOL', (await text('h1')) === 'SOL/USDT');

  // Halted market
  await page.goto(`${base}/trade/BNB-USDT`);
  await page.waitForSelector('.market-banner');
  await wait(1200);
  check('halted banner', /BNB\/USDT is halted/.test(await text('.market-banner')));
  check('halted button', (await text('.ticket-submit')) === 'Market halted' && await page.isDisabled('.ticket-submit'));
  check('halted book empty', /halted, so the book is empty/.test(await text('.ladder-panel')), await text('.ladder-panel'));

  // Unknown market
  await page.goto(`${base}/trade/XYZ-USDT`);
  await page.waitForSelector('.trade-missing');
  check('missing market', /no XYZ\/USDT market/.test(await text('.trade-missing h1')));

  // Guest
  await page.evaluate(async () => (await import('/src/presenters/shared/session.presenter.js')).endUser());
  await page.goto(`${base}/trade/BTC-USDT`);
  await page.waitForSelector('.login-cta');
  check('guest CTA', /Log in to trade BTC\/USDT/.test(await text('.login-cta')));
  check('guest orders panel', /Log in to see your orders/.test(await text('.orders-panel')));
  // Phone: the ticket opens in a sheet from the Buy and Sell bar
  await signIn('demo', { fresh: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/trade/BTC-USDT`);
  await page.waitForSelector('.phone-bar');
  await wait(1200);
  check('phone has no desktop ticket', (await page.locator('.ticket').count()) === 0);
  await page.click('.phone-actions .btn-sell');
  await page.waitForSelector('.ticket-sheet');
  check('sheet opens on sell', (await text('.ticket-sheet .dialog-title')) === 'Sell BTC', await text('.ticket-sheet .dialog-title'));
  check('focus moved into the sheet', await page.evaluate(() => Boolean(document.activeElement?.closest('.ticket-sheet'))));
  await page.keyboard.press('Escape');
  await wait(200);
  check('escape closes the sheet', (await page.locator('.ticket-sheet').count()) === 0);
  await page.click('.phone-tabs .tab:has-text("Book")');
  check('book tab', (await page.locator('#trade-book[role=tabpanel]').count()) === 1);
  await page.locator('.ladder-bids .ladder-pick').first().click();
  await page.waitForSelector('.ticket-sheet');
  check('ladder pick opens the sheet', /\d/.test(await page.inputValue('#sheet-price')), await page.inputValue('#sheet-price'));
  await page.keyboard.press('Escape');
  await page.click('.phone-tabs .tab:has-text("Trades")');
  check('trades tab', (await page.locator('.tape tbody tr').count()) > 5);
  check('no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
