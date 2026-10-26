// Drives Profile: the name, Discard, preferences, and confirming the email.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();

try {
  await signIn('demo');
  await page.goto(`${base}/account`);
  await page.waitForSelector('#profile-name');
  check('account opens on profile', new URL(page.url()).pathname === '/account/profile');
  check('sidebar marks profile', (await page.getAttribute('.account-nav a[aria-current="page"]', 'href')) === '/account/profile');
  check('name filled', (await page.inputValue('#profile-name')) === 'Demo trader');
  const facts = await text('.profile-facts');
  check('facts', /demo@orichal\.app\s*Not confirmed/.test(facts) && /Not linked/.test(facts) && /Member since\s+\d{1,2} \w{3} 2026/i.test(facts), facts);
  check('dark theme not offered yet', await page.locator('#prefs-theme option[value="dark"]').isDisabled());

  // A name that's too short, then a good one
  await page.fill('#profile-name', 'D');
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector('#profile-name[aria-invalid="true"]');
  check('short name refused', /2 to 40 characters/.test(await text('.profile-panel .field-error')));
  await page.fill('#profile-name', 'Demo trader two');
  check('error clears once fixed', (await page.locator('.profile-panel .field-error').count()) === 0);
  await page.press('#profile-name', 'Enter');
  await page.waitForSelector('.toast:has-text("Profile saved")');
  await page.waitForFunction(() => /Demo trader two/.test(document.querySelector('.app-header')?.textContent ?? ''));
  check('header shows the new name', true);
  await page.reload();
  await page.waitForSelector('#profile-name');
  check('name kept after reload', (await page.inputValue('#profile-name')) === 'Demo trader two');

  // Discard
  await page.fill('#profile-name', 'Someone else');
  await page.click('button:has-text("Discard")');
  check('discard restores the saved name', (await page.inputValue('#profile-name')) === 'Demo trader two');

  // Preferences reach the wallet
  await page.check('#prefs-hide-small');
  await page.click('button:has-text("Save preferences")');
  await page.waitForSelector('.toast:has-text("Preferences saved")');
  const saved = await page.evaluate(async () => (await import('/src/models/stores/session.store.js')).currentUser().preferences.hideSmallBalances);
  check('saved to the account', saved === true);
  await page.goto(`${base}/wallet`);
  await page.waitForSelector('.balances-table tbody tr');
  check('wallet hides small balances', await page.isChecked('#hide-small'));

  // Resend link confirms the email after a moment
  await page.goto(`${base}/account/profile`);
  await page.waitForSelector('.notice-bar button:has-text("Resend link")');
  await page.click('.notice-bar button:has-text("Resend link")');
  await page.waitForSelector('.notice-bar', { state: 'detached', timeout: 10000 });
  await page.waitForSelector('.profile-facts .status-tag:has-text("Confirmed")');
  check('email confirmed', /demo@orichal\.app\s*Confirmed/.test(await text('.profile-facts')));

  // Phone width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
