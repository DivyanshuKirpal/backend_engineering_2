// Screenshots for comparing pages with the design boards (Playwright).
// Starts the server on a spare port with a store of its own (as the checks
// do), signs in through the API when asked, and saves full-page PNGs to
// .screenshots/ (git-ignored).
//
// Usage: npm run shots -- [--as=demo|admin|guest] [--widths=1440,390] [--wait=1200] [--fresh] /markets wallet ...
//   Routes may leave out the leading slash ("home" is /), which also keeps Git Bash
//   from turning them into Windows paths.
//   --fresh   reset the demo data first, so the page matches its board's state
//   --verified  confirm the user's email first, so no verify banner shows
//   --kyc=none  set the user's identity check first (Verification's board is at Not started)

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { signInPage, startServer } from './checks/harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.screenshots');
const args = process.argv.slice(2);
const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const routes = args.filter((a) => !a.startsWith('--')).map((a) => (a === 'home' ? '/' : a.startsWith('/') ? a : `/${a}`));
if (!routes.length) {
  console.error('Name at least one route, e.g. npm run shots -- --as=demo /wallet');
  process.exit(1);
}
const as = flag('as', 'guest');
const widths = flag('widths', '1440,390').split(',').map(Number);
const wait = Number(flag('wait', '1200'));
const fresh = args.includes('--fresh');
const verified = args.includes('--verified');
const kyc = (args.find((a) => a.startsWith('--kyc=')) ?? '').slice(6);

// --kyc=<status> sets the signed-in user's identity check first, for boards
// drawn at another moment (Verification shows Not started; the demo trader is
// approved); "none" also drops their applications. --verified confirms their
// email, so the verify banner doesn't push the page down (the boards other
// than Profile draw it confirmed).
const signIn = (page, base) => signInPage(page, base, as, { fresh, kyc: kyc || null, verified });

const server = await startServer();
const { base } = server;
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width >= 768 ? 920 : 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error(`[page error] ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') console.error(`[console] ${msg.text()}`); });
    await signIn(page, base);
    for (const route of routes) {
      await page.goto(`${base}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(wait);
      const name = `${route.replace(/[/?=&]+/g, '_').replace(/^_|_$/g, '') || 'home'}-${as}-${width}.png`;
      await page.screenshot({ path: join(outDir, name), fullPage: true });
      console.log(join('.screenshots', name));
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}
