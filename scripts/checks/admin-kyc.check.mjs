// Drives Admin · KYC review: opening, rejecting with a reason, approving.
import { start } from './harness.mjs';

const { page, base, check, fail, finish, signIn } = await start();
const text = (sel) => page.locator(sel).first().innerText();
const rows = () => page.locator('.kyc-table tbody tr:not(:has(.kyc-empty))').count();
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 6000 });
const audits = (action) => page.evaluate(async (a) => (await import('/src/models/api/mock/db.js')).db().audit.filter((x) => x.action === a).length, action);

try {
  await signIn('admin');
  const views0 = await audits('admin.kyc_document_viewed');
  await page.goto(`${base}/admin/kyc`);
  await page.waitForSelector('.doc-ready');
  check('seven waiting', (await rows()) === 7 && /Pending\s*7/.test(await text('.admin-tabs .tab.current')));
  check('oldest open first', (await text('.kyc-review-name')) === 'Aarav Mehta' && (await page.getAttribute('.kyc-table tr.current .kyc-open', 'aria-current')) === 'true');
  const facts = await text('.kyc-review-facts');
  check('facts', /Full legal name\s+Aarav Mehta/.test(facts) && /17 Apr 2001 · \d+ years/.test(facts) && /Passport\s*••••4821/.test(facts), facts);
  check('opening the image is audited', (await audits('admin.kyc_document_viewed')) === views0 + 1);
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
  const aarav = await page.evaluate(async () => (await import('/src/models/api/mock/db.js')).db().users.find((u) => u.displayName === 'Aarav Mehta')?.kycStatus);
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check('no sideways scroll on phones', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
} catch (err) {
  fail(err);
} finally {
  await finish();
}
