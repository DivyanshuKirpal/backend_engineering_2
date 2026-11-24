// Drives Admin · KYC review: opening, rejecting with a reason, approving, and
// the uploaded images.
import { join } from 'node:path';
import { start } from './harness.mjs';

const { page, context, base, shots, check, fail, finish, signIn, api, snapshot } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const rows = () => page.locator('.kyc-table tbody tr:not(:has(.kyc-empty))').count();
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 6000 });
const audits = async (action) => (await snapshot('audit')).audit.filter((x) => x.action === action).length;

/** A new person sends an application with these images. */
async function apply(displayName, documentImage, selfieImage) {
  const email = `${displayName.toLowerCase().replace(/ /g, '.')}@example.com`;
  const { body } = await api('POST', '/auth/register', { email, password: 'Correct-horse-42', displayName });
  const form = new FormData();
  const fields = { fullName: displayName, dateOfBirth: '1999-04-17', country: 'IN', documentType: 'passport', documentNumber: 'AB12345' };
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set('documentImage', new Blob([documentImage], { type: 'image/jpeg' }), 'passport.jpg');
  if (selfieImage) form.set('selfieImage', new Blob([selfieImage], { type: 'image/png' }), 'selfie.png');
  const res = await fetch(`${base}/api/v1/kyc`, { method: 'POST', headers: { Authorization: `Bearer ${body.data.accessToken}` }, body: form });
  if (res.status !== 201) throw new Error(`POST /kyc answered ${res.status}`);
}

try {
  // Which object URLs are alive: an image of somebody's document has to be let go again
  await page.addInitScript(() => {
    window.liveUrls = new Set();
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = (blob) => {
      const url = createObjectURL.call(URL, blob);
      window.liveUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.liveUrls.delete(url);
      revokeObjectURL.call(URL, url);
    };
  });
  const live = () => page.evaluate(() => window.liveUrls.size);
  await signIn('admin');
  const views0 = await audits('admin.kyc_document_viewed');
  await page.goto(`${base}/admin/kyc`);
  await page.waitForSelector('.doc-ready');
  check('seven waiting', (await rows()) === 7 && /Pending\s*7/.test(await text('.admin-tabs .tab.current')));
  check('oldest open first', (await text('.kyc-review-name')) === 'Aarav Mehta' && (await page.getAttribute('.kyc-table tr.current .kyc-open', 'aria-current')) === 'true');
  const facts = await text('.kyc-review-facts');
  check('facts', /Full legal name\s+Aarav Mehta/.test(facts) && /17 Apr 2001 · \d+ years/.test(facts) && /Passport\s*••••4821/.test(facts), facts);
  check('opening the image is audited', (await audits('admin.kyc_document_viewed')) === views0 + 1);
  const placeholder = async () => (await page.locator('.doc-ready .doc-photo').count()) === 1 && (await page.locator('.doc-image').count()) === 0 && /^Placeholder/.test(await text('.doc-ready figcaption'));
  check('no image was sent: the drawn placeholder', await placeholder());
  const frame = () => page.locator('.doc-shape').first().evaluate((el) => `${el.offsetWidth}x${el.offsetHeight}`);
  const drawnFrame = await frame();
  check('oldest wait in brass', (await page.locator('.kyc-table .queue-wait-oldest').count()) === 1);

  await page.click('.kyc-open:has-text("Lucía Romero")');
  await until(() => document.querySelector('.kyc-review-name')?.textContent === 'Lucía Romero' && document.querySelector('.doc-ready'));
  check('another applicant opens', /Spain/.test(await text('.kyc-review-facts')) && (await audits('admin.kyc_document_viewed')) === views0 + 2);

  // Reject Lucía with a reason
  await page.click('button:has-text("Reject with a reason")');
  await page.waitForSelector('.reject-dialog');
  await page.waitForFunction(() => document.activeElement?.id === 'reject-reason');
  check('reason field takes focus', true);
  await page.click('.reject-dialog button[type="submit"]');
  check('a reason is required', /Give the reason the person will see/.test(await text('.reject-dialog')));
  await page.click('.reject-suggestions button:has-text("Photo too blurry")');
  check('a common reason fills in', (await page.inputValue('#reject-reason')) === 'Photo too blurry');
  await page.click('.reject-dialog button[type="submit"]');
  await page.waitForSelector('.toast:has-text("Rejected")');
  await until(() => document.querySelectorAll('.kyc-table tbody tr').length === 6);
  check('one fewer waiting', /Pending\s*6/.test(await text('.admin-tabs .tab.current')));
  await until(() => /KYC review[\s\S]*6/.test(document.querySelector('.admin-nav')?.textContent ?? ''));
  check('sidebar count follows at once', true);

  // Approve Aarav
  await page.click('.kyc-open:has-text("Aarav Mehta")');
  await until(() => document.querySelector('.kyc-review-name')?.textContent === 'Aarav Mehta');
  await page.click('.kyc-review-actions button:has-text("Approve")');
  await page.waitForSelector('.toast:has-text("Approved")');
  await until(() => document.querySelectorAll('.kyc-table tbody tr').length === 5);
  check('approved leaves the queue', !/Aarav Mehta/.test(await text('.kyc-table tbody')));
  const aarav = (await snapshot('users')).users.find((u) => u.displayName === 'Aarav Mehta')?.kycStatus;
  check('the account is approved', aarav === 'approved', aarav);

  // The decided lists
  await page.click('.admin-tabs .tab:has-text("Approved")');
  await until(() => /Aarav Mehta/.test(document.querySelector('.kyc-table tbody')?.textContent ?? ''));
  check('approved list, newest first', /Aarav Mehta/.test(await text('.kyc-table tbody tr')) && (await page.locator('.kyc-table thead th:has-text("Decided")').count()) === 1);
  await until(() => /Approved \d/.test(document.querySelector('.kyc-review-decision')?.textContent ?? ''));
  check('decided has no buttons', (await page.locator('.kyc-review-actions').count()) === 0);
  await page.click('.admin-tabs .tab:has-text("Rejected")');
  await until(() => /Lucía Romero/.test(document.querySelector('.kyc-table tbody')?.textContent ?? ''));
  check('rejected list with the reason', /Photo too blurry/.test(await text('.kyc-table tbody tr:has-text("Lucía Romero")')));

  // Uploaded images, drawn in the same frame
  const studio = await context.newPage();
  await studio.setContent('<body style="margin:0;background:linear-gradient(135deg,#b8860b,#123);color:#fff;font:56px serif">SAMPLE</body>');
  await studio.setViewportSize({ width: 640, height: 400 });
  const passport = await studio.screenshot({ type: 'jpeg' });
  await studio.setViewportSize({ width: 300, height: 420 });
  const selfie = await studio.screenshot({ type: 'png' });
  await studio.close();
  await apply('Real Photo', passport, selfie);
  await apply('Broken Photo', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]));
  await page.click('.admin-tabs .tab:has-text("Pending")');
  await page.waitForSelector('.kyc-open:has-text("Real Photo")');
  await page.waitForSelector('.doc-ready'); // the first in the list opens by itself, and counts too
  const views1 = await audits('admin.kyc_document_viewed');
  await page.click('.kyc-open:has-text("Real Photo")');
  const drawn = (width, n = 0) => until(([w, i]) => {
    const img = document.querySelectorAll('.doc-image')[i];
    return img?.complete && img.naturalWidth === w;
  }, [width, n]);
  await drawn(640);
  check('the uploaded document is drawn', /^As it was sent/.test(await text('.doc-ready figcaption')) && (await page.locator('.doc-photo').count()) === 0);
  check('in the same frame, whole', (await frame()) === drawnFrame && (await page.locator('.doc-image').first().evaluate((el) => {
    const box = el.getBoundingClientRect();
    const around = el.parentElement.getBoundingClientRect();
    return getComputedStyle(el).objectFit === 'contain' && Math.abs(box.width - around.width) < 1 && Math.abs(box.height - around.height) < 1;
  })), `${drawnFrame} ${await frame()}`);
  check('named for screen readers', (await page.getAttribute('.doc-image', 'alt')) === 'Passport sent by Real Photo');
  if (shots) await page.screenshot({ path: join(shots, 'admin-kyc-photo-1440.png') });
  await page.click('button:has-text("Open the selfie")');
  await drawn(300, 1);
  check('and the selfie', (await page.locator('.doc-image').nth(1).getAttribute('alt')) === 'Selfie sent by Real Photo');
  check('each view is audited', (await audits('admin.kyc_document_viewed')) === views1 + 2);
  const held = await live();
  await page.click('.kyc-table tbody tr:first-child .kyc-open');
  await until(() => document.querySelector('.kyc-review-name')?.textContent !== 'Real Photo' && document.querySelector('.doc-ready .doc-photo'));
  check('closing the application lets both images go', held === 2 && (await live()) === 0, `${held} ${await live()}`);
  check('a seeded one keeps its placeholder', await placeholder());
  await page.click('.kyc-open:has-text("Broken Photo")');
  await page.waitForSelector('.doc-error');
  check('an image that can\'t be drawn says so', /The image didn't load/.test(await text('.doc-error figcaption')) && (await page.locator('.doc-image').count()) === 0);
  await page.click('.kyc-open:has-text("Real Photo")');
  await drawn(640);

  await page.click('.admin-nav a:has-text("Users")');
  await page.waitForURL('**/admin/users');
  check('so does leaving the page', (await live()) === 0, String(await live()));
  await page.goto(`${base}/admin/kyc`);
  await page.waitForSelector('.doc-ready');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
