// Drives Security: devices, two-factor off and on, and changing the password.
import { join } from 'node:path';
import { start } from './harness.mjs';

const { page, base, shots, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const deviceRows = () => page.locator('.device-row').count();

try {
  await signIn('demo');
  await page.goto(`${base}/account/security`);
  await page.waitForSelector('.device-row');
  await page.waitForSelector('.activity-table tbody tr');
  check('two-factor on', /Two-factor authentication is on/.test(await text('.twofa-card')) && /Since \d{1,2} \w{3} 2026\./.test(await text('.twofa-card')));
  check('three devices, this one first', (await deviceRows()) === 3 && /Chrome 130 on macOS\s*This device/.test(await text('.device-row')) && /Active now/.test(await text('.device-row')));
  check('devices in sign-in order', /Safari on iPhone/.test(await page.locator('.device-row').nth(1).innerText()) && /Firefox 131 on Windows/.test(await page.locator('.device-row').nth(2).innerText()));
  check('no sign out for this device', (await page.locator('.device-row').first().locator('button').count()) === 0);
  const activity = await text('.activity-table tbody');
  check('activity', /Wrong password/.test(activity) && /Two-factor turned on/.test(activity) && /Account created/.test(activity));
  check('failed attempt in red', (await page.locator('.activity-warning').count()) === 1);
  check('meter at rest', /At least 8 characters\./.test(await text('#pw-new-strength')));

  // Devices
  await page.click('.device-row:has-text("Safari") button:has-text("Sign out")');
  await page.waitForSelector('.toast:has-text("Signed out")');
  await page.waitForFunction(() => document.querySelectorAll('.device-row').length === 2);
  check('one device signed out', /Signed-in devices · 2/i.test(await text('.devices-panel .panel-label')));
  await page.waitForFunction(() => /Signed out a device/.test(document.querySelector('.activity-table tbody')?.textContent ?? ''));
  check('activity notes it', true);
  await page.click('button:has-text("Sign out all other devices")');
  await page.waitForFunction(() => document.querySelectorAll('.device-row').length === 1);
  check('all others signed out', await page.locator('button:has-text("Sign out all other devices")').isDisabled());

  // Two-factor off
  await page.click('.twofa-card button:has-text("Turn off")');
  await page.waitForSelector('.twofa-dialog');
  check('focus moves into the dialog', await page.evaluate(() => Boolean(document.activeElement?.closest('.twofa-dialog'))));
  await page.click('.twofa-dialog button[type="submit"]');
  check('asks for password and code', /Enter your password/.test(await text('.twofa-dialog')) && /Enter the six digits/.test(await text('.twofa-dialog')));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.twofa-dialog', { state: 'detached' });
  check('escape closes, focus back', await page.evaluate(() => /Turn off/.test(document.activeElement?.textContent ?? '')));
  await page.click('.twofa-card button:has-text("Turn off")');
  await page.fill('#twofa-password', 'wrong-password');
  await page.click('.twofa-dialog button:has-text("Use the demo code")');
  check('demo code filled', (await page.inputValue('#twofa-code')) === '123456');
  await page.click('.twofa-dialog button[type="submit"]');
  await page.waitForSelector('#twofa-password[aria-invalid="true"]');
  check('wrong password refused', /isn't right/.test(await text('.twofa-dialog')));
  await page.fill('#twofa-password', 'orichal-demo');
  await page.click('.twofa-dialog button[type="submit"]');
  await page.waitForSelector('.twofa-dialog', { state: 'detached' });
  await page.waitForSelector('.twofa-card:has-text("is off")');
  check('two-factor off', /Turn on/.test(await text('.twofa-card')));

  // Two-factor on again
  await page.click('.twofa-card button:has-text("Turn on")');
  await page.waitForSelector('.twofa-dialog .twofa-key-value');
  check('setup shows a key and a QR code', /[A-Z2-7]{4} [A-Z2-7]{4}/.test(await text('.twofa-key-value')) && (await page.locator('.twofa-dialog .twofa-setup svg, .twofa-dialog .twofa-setup img, .twofa-dialog .twofa-setup canvas').count()) > 0);
  if (shots) await page.screenshot({ path: join(shots, 'security-twofa-setup-1440.png') });
  await page.fill('#twofa-code', '000000');
  await page.click('.twofa-dialog button[type="submit"]');
  await page.waitForSelector('#twofa-code[aria-invalid="true"]');
  check('wrong code refused', /didn't work/.test(await text('.twofa-dialog')));
  await page.click('.twofa-dialog button:has-text("Use the demo code")');
  await page.click('.twofa-dialog button[type="submit"]');
  await page.waitForSelector('.twofa-dialog', { state: 'detached' });
  await page.waitForSelector('.twofa-card:has-text("is on")');
  check('two-factor on again', /Since \d{1,2} \w{3} 2026\./.test(await text('.twofa-card')));

  // Change the password
  await page.click('button:has-text("Change password")');
  check('empty form refused', /Enter your current password/.test(await text('.password-panel')) && /Choose a new password/.test(await text('.password-panel')));
  await page.fill('#pw-current', 'not-it');
  await page.fill('#pw-new', 'Correct-horse-42');
  check('meter rates the new one', /Strong\./.test(await text('#pw-new-strength')));
  await page.fill('#pw-repeat', 'Correct-horse-41');
  await page.click('button:has-text("Change password")');
  check('repeat must match', /don't match/.test(await text('.password-panel')));
  await page.fill('#pw-repeat', 'Correct-horse-42');
  await page.click('button:has-text("Change password")');
  await page.waitForSelector('#pw-current[aria-invalid="true"]');
  check('wrong current password', /current password isn't right/.test(await text('.password-panel')));
  await page.fill('#pw-current', 'orichal-demo');
  await page.click('button:has-text("Change password")');
  await page.waitForSelector('.toast:has-text("Password changed")');
  check('fields cleared', (await page.inputValue('#pw-current')) === '' && (await page.inputValue('#pw-new')) === '');
  await page.waitForFunction(() => /Password changed/.test(document.querySelector('.activity-table tbody')?.textContent ?? ''));
  check('activity notes the change', true);
  const works = await page.evaluate(async () => {
    const { handle } = await import('/src/models/api/mock/server.js');
    const r = await handle({ method: 'POST', path: '/auth/login', body: { email: 'demo@orichal.app', password: 'Correct-horse-42' } });
    return r.status;
  });
  check('new password signs in', works === 200, String(works));

  // Phone width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
