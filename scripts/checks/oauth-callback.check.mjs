// Drives the OAuth callback: Google's errors shown and cleared from the
// address bar, a two-factor ticket cleared too, and the way to log in by email.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const address = () => new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash;
const open = async (path) => {
  await page.goto(`${base}${path}`);
  await page.waitForSelector('.auth-message');
};

try {
  await signIn('guest');

  // An error Google sent back
  await open('/oauth/callback?error=access_denied');
  check('title', (await page.title()) === 'Signing in with Google · Orichal', await page.title());
  check('says it didn\'t work', (await text('h1')) === 'Google sign-in didn\'t work' && /You cancelled the Google sign-in/.test(await text('.auth-error')));
  check('the error leaves the address bar', address() === '/oauth/callback', address());
  check('explains Google waits for the backend', /needs the server, which comes with the backend/.test(await text('.auth-message')));
  check('the brand panel follows', /Back from Google/.test(await text('.auth-aside')));
  check('marked undesigned', /Not drawn yet/.test(await text('.undesigned-note')));
  await page.reload();
  await page.waitForSelector('.auth-message');
  check('a reload doesn\'t bring it back', (await page.locator('.auth-error').count()) === 0 && (await text('h1')) === 'Google sign-in isn\'t ready yet');

  // Codes it doesn't know, and anything that isn't a code
  await open('/oauth/callback?error=server_busy');
  check('an unknown code is named', /Google sign-in didn't work \(server_busy\)\./.test(await text('.auth-error')));
  await open(`/oauth/callback?error=${encodeURIComponent('<img src=x onerror=alert(1)>')}`);
  check('anything else isn\'t repeated', (await text('.auth-error')) === 'Google sign-in didn\'t work.' && (await page.locator('.auth-message img').count()) === 0);

  // A two-factor ticket in the fragment is cleared too
  await open('/oauth/callback#ticket=abc123');
  check('the ticket leaves the address bar', address() === '/oauth/callback', address());
  check('and the page says what it was', /two-factor code/.test(await text('.auth-message')) && (await page.locator('.auth-error').count()) === 0);

  // Log in by email from here
  await page.click('.auth-message a:has-text("Log in with email")');
  await page.waitForSelector('#login-email');
  check('log in by email', new URL(page.url()).pathname === '/login');
  await page.goBack();
  await page.waitForSelector('.auth-message');
  check('create an account', (await page.getAttribute('.auth-message a:has-text("Create a demo account")', 'href')) === '/register');

  // Signed in already
  await signIn('demo');
  await open('/oauth/callback');
  await page.waitForFunction(() => /signed in as Demo trader/.test(document.querySelector('.auth-message')?.textContent ?? ''));
  check('signed in: a way to the markets', (await page.getAttribute('.auth-message a.btn-primary', 'href')) === '/markets' && (await page.locator('.auth-message a:has-text("Log in")').count()) === 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await open('/oauth/callback?error=access_denied');
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
