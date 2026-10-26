// Drives Log in (with its code step) and Register like a user.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const wait = (ms) => page.waitForTimeout(ms);
const signOut = () => page.evaluate(async () => (await import('/src/presenters/shared/session.presenter.js')).endUser());

try {
  await signIn('guest');

  await page.goto(`${base}/login`);
  await page.waitForSelector('.auth-card');
  check('h1', (await text('h1')) === 'Log in');
  check('aside facts from the markets', /BTC · ETH · SOL · BNB, in USDT/.test(await text('.auth-facts')), await text('.auth-facts'));

  // Empty submit
  await page.click('.auth-submit');
  const errs = await page.locator('.field-error').allInnerTexts();
  check('empty errors', errs.includes('Enter your email.') && errs.includes('Enter your password.'), JSON.stringify(errs));
  check('email has aria-invalid', (await page.getAttribute('#login-email', 'aria-invalid')) === 'true');

  // Wrong password
  await page.fill('#login-email', 'demo@orichal.app');
  await page.fill('#login-password', 'nope-nope');
  await page.click('.auth-submit');
  await page.waitForSelector('.auth-error');
  check('wrong password message', /don't match an account/.test(await text('.auth-error')), await text('.auth-error'));
  check('password cleared', (await page.inputValue('#login-password')) === '');

  // Show toggles the type
  await page.fill('#login-password', 'abc');
  await page.click('.input-trailing');
  check('show reveals', (await page.getAttribute('#login-password', 'type')) === 'text');
  check('show pressed', (await page.getAttribute('.input-trailing', 'aria-pressed')) === 'true');
  await page.click('.input-trailing');

  // Demo trader through the code step
  await page.click('.demo-signin-row:has-text("Demo trader") .link');
  check('demo fill', (await page.inputValue('#login-email')) === 'demo@orichal.app' && (await page.inputValue('#login-password')) === 'orichal-demo');
  await page.click('.auth-submit');
  await page.waitForSelector('#login-code');
  await wait(200);
  check('code step heading', (await text('h1')) === 'Enter your code');
  check('code field focused', await page.evaluate(() => document.activeElement?.id === 'login-code'));
  check('aside switched', /One more step/.test(await text('.auth-aside')));
  check('5 tries left', /5 tries left/.test(await text('.otp-hint')));
  await page.keyboard.type('000000');
  await page.waitForSelector('.otp .field-error');
  check('wrong code error', /didn't work/.test(await text('.otp .field-error')), await text('.otp .field-error'));
  check('4 tries left', /4 tries left/.test(await text('.otp-hint')), await text('.otp-hint'));
  check('code cleared', (await page.inputValue('#login-code')) === '');

  // Use a different account and come back
  await page.click('.auth-switch .link');
  await page.waitForSelector('#login-password');
  check('back to password', (await text('h1')) === 'Log in' && await page.evaluate(() => document.activeElement?.id === 'login-password'));
  await page.fill('#login-password', 'orichal-demo');
  await page.click('.auth-submit');
  await page.waitForSelector('#login-code');
  check('fresh ticket, 5 tries', /5 tries left/.test(await text('.otp-hint')));
  await page.click('.demo-signin-code .link');
  await page.waitForURL('**/markets');
  await page.waitForSelector('.user-chip');
  check('signed in to markets', /Demo trader/.test(await text('.user-chip')));

  // A signed-in user at /login goes to /markets
  await page.goto(`${base}/login`);
  await page.waitForURL('**/markets');
  check('guest-only guard', page.url().endsWith('/markets'));

  // Admin, with next
  await signOut();
  await page.goto(`${base}/login?next=/admin/kyc`);
  await page.waitForSelector('.auth-card');
  await page.click('.demo-signin-row:has-text("Admin") .link');
  await page.click('.auth-submit');
  await page.waitForURL('**/admin/kyc');
  check('admin lands on next', page.url().endsWith('/admin/kyc'));

  // An outside next is ignored
  await signOut();
  await page.goto(`${base}/login?next=//evil.example`);
  await page.waitForSelector('.auth-card');
  await page.click('.demo-signin-row:has-text("Admin") .link');
  await page.click('.auth-submit');
  await page.waitForURL('**/admin');
  check('outside next ignored', new URL(page.url()).pathname === '/admin');

  // Lockout after five wrong passwords
  await signOut();
  await page.goto(`${base}/login`);
  await page.waitForSelector('.auth-card');
  for (let i = 0; i < 5; i += 1) {
    await page.fill('#login-email', 'admin@orichal.app');
    await page.fill('#login-password', `wrong-${i}`);
    await page.click('.auth-submit');
    await page.waitForFunction(() => !document.querySelector('.auth-submit').disabled);
  }
  check('locked message', /paused until \d\d:\d\d/.test(await text('.auth-error')), await text('.auth-error'));

  // Google
  await page.click('.google-btn');
  await page.waitForSelector('.toast');
  check('google toast', /needs the server/.test(await text('.toast')));

  // Register
  await page.goto(`${base}/register`);
  await page.waitForSelector('.auth-card');
  check('register h1', (await text('h1')) === 'Create a demo account');
  await page.click('.auth-submit');
  const rerrs = await page.locator('.field-error').allInnerTexts();
  check('register empty errors', rerrs.length === 4, JSON.stringify(rerrs));
  await page.fill('#register-password', 'short');
  check('meter weak', /Too weak\./.test(await text('.strength-text')) && (await page.locator('.strength-bar.on').count()) === 1, await text('.strength-text'));
  await page.fill('#register-password', 'OrichalDemoPass');
  check('meter good', /Good\. Add a number or symbol to make it strong\./.test(await text('.strength-text')) && (await page.locator('.strength-bar.on').count()) === 3, await text('.strength-text'));
  await page.fill('#register-password', 'OrichalDemoPass-26');
  check('meter strong', /Strong\./.test(await text('.strength-text')) && (await page.locator('.strength-bar.on').count()) === 4, await text('.strength-text'));
  await page.fill('#register-name', 'Tester');
  await page.fill('#register-email', 'demo@orichal.app');
  await page.click('#register-agree');
  await page.click('.auth-submit');
  await page.waitForSelector('#register-email[aria-invalid="true"]');
  check('taken email', /already exists/.test(await page.locator('.field-error').first().innerText()), await page.locator('.field-error').allInnerTexts());
  const email = `tester${Date.now() % 100000}@example.com`;
  await page.fill('#register-email', email);
  await page.click('.auth-submit');
  await page.waitForURL('**/markets');
  await page.waitForSelector('.user-chip');
  check('registered and in', /Tester/.test(await text('.user-chip')));
  const usdt = await page.evaluate(async () => {
    const bs = await import('/src/models/stores/balance.store.js');
    for (let i = 0; i < 40 && bs.balances.get().status !== 'ready'; i += 1) await new Promise((r) => setTimeout(r, 100));
    return bs.freeByAsset().USDT;
  });
  check('10,000 USDT credited', usdt === '10000.000000' || usdt === '10000', usdt);
  check('verify banner for new account', (await page.locator('.notice-bar[aria-label="Email confirmation"]').count()) === 1);
} catch (err) {
  fail(err);
} finally {
  await finish();
}
