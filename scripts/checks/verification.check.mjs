// Drives Verification: the form's checks, files, sending it, and the outcomes.
import { join } from 'node:path';
import { start } from './harness.mjs';

const { page, base, shots, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const jpeg = { name: 'passport-sample.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2048, 1) };

/** Sets the demo trader's check in the mock, as an admin's decision would. */
async function decide(status, reason = null) {
  await page.evaluate(async ([s, r]) => {
    const { db, persist } = await import('/src/models/api/mock/db.js');
    const me = db().users.find((u) => u.email === 'demo@orichal.app');
    const app = db().kyc.filter((k) => k.userId === me.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    app.status = s;
    app.rejectReason = r;
    app.reviewedAt = new Date().toISOString();
    me.kycStatus = s;
    persist();
  }, [status, reason]);
}

try {
  await signIn('demo', { kyc: 'none' });
  await page.goto(`${base}/account/verification`);
  await page.waitForSelector('.kyc-form');
  check('not started', /Not started/.test(await text('.kyc-panel')) && (await text('.kyc-step-now .kyc-step-number')) === '01 · now');
  check('country defaults to India', (await page.inputValue('#kyc-country')) === 'IN');
  check('passport picked', await page.isChecked('input[name="kyc-document-type"][value="passport"]'));

  // Everything missing
  await page.click('button:has-text("Submit for review")');
  const refused = await text('.kyc-form');
  check('missing fields refused', /Enter your name/.test(refused) && /Enter your date of birth/.test(refused) && /Enter the document number/.test(refused) && /Add a photo of the document/.test(refused) && /Tick the box/.test(refused), refused);

  // The date of birth
  await page.fill('#kyc-dob', '17042001');
  check('date masked as typed', (await page.inputValue('#kyc-dob')) === '17 / 04 / 2001');
  await page.fill('#kyc-dob', '31022001');
  await page.click('button:has-text("Submit for review")');
  check('impossible date refused', /Enter a real date/.test(await text('.kyc-form')));
  await page.fill('#kyc-dob', '01012015');
  await page.click('button:has-text("Submit for review")');
  check('under 18 refused', /You need to be 18 or older\./.test(await text('#kyc-dob-error')));
  await page.fill('#kyc-dob', '17042001');

  // Files
  await page.setInputFiles('#kyc-document', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(100) });
  check('a PDF is refused', /JPEG or PNG/.test(await text('.kyc-files .field-error')));
  await page.click('.kyc-files .file-drop-chosen button:has-text("Remove")');
  await page.setInputFiles('#kyc-document', jpeg);
  await page.waitForSelector('.file-drop-chosen:has-text("passport-sample.jpg")');
  check('document chosen', /passport-sample\.jpg\s*2 KB/.test(await text('.file-drop-chosen')));
  const dropped = await page.evaluate(() => {
    const zone = document.querySelector('label[for="kyc-selfie"]');
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(1500)], 'selfie.png', { type: 'image/png' }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return true;
  });
  await page.waitForSelector('.file-drop-chosen:has-text("selfie.png")');
  check('selfie dropped on', dropped);

  await page.fill('#kyc-name', 'Demo Trader');
  await page.selectOption('#kyc-country', 'IN');
  await page.click('label.radio-card:has-text("National ID")');
  await page.fill('#kyc-number', 'abcd 98765');
  await page.check('#kyc-sample');
  if (shots) await page.screenshot({ path: join(shots, 'verification-filled-1440.png'), fullPage: true });
  await page.click('button:has-text("Submit for review")');
  await page.waitForSelector('.toast:has-text("Sent for review")');
  await page.waitForSelector('.kyc-application');
  check('pending review', /Pending review/.test(await text('.kyc-panel')) && (await text('.kyc-step-now .kyc-step-number')) === '02 · now');
  const facts = await text('.kyc-facts');
  check('summary of what was sent', /Demo Trader/.test(facts) && /17 Apr 2001/.test(facts) && /India/.test(facts) && /National ID ending 8765/.test(facts), facts);
  check('session knows', (await page.evaluate(async () => (await import('/src/models/stores/session.store.js')).currentUser().kycStatus)) === 'pending');

  // Approved, then rejected and sent again
  await decide('approved');
  await page.reload();
  await page.waitForSelector('.kyc-panel');
  check('approved', /Approved/.test(await text('.kyc-panel')) && (await page.locator('.kyc-step-done').count()) === 3 && (await page.getAttribute('.kyc-panel-note a', 'href')) === '/wallet/withdraw');
  await decide('rejected', 'photo too blurry');
  await page.reload();
  await page.waitForSelector('.kyc-form');
  check('rejected with the reason', /Rejected: photo too blurry/.test(await text('.kyc-panel')) && /turned it down: photo too blurry/.test(await text('.kyc-panel-note')));
  check('form comes back filled', (await page.inputValue('#kyc-name')) === 'Demo Trader' && (await page.inputValue('#kyc-dob')) === '17 / 04 / 2001' && await page.isChecked('input[name="kyc-document-type"][value="national_id"]'));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
