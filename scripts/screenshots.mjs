// Screenshots for comparing pages with the design boards (Playwright).
// Starts the dev server on a spare port, signs in through the mock API when
// asked, and saves full-page PNGs to .screenshots/ (git-ignored).
//
// Usage: npm run shots -- [--as=demo|admin|guest] [--widths=1440,390] [--wait=1200] [--fresh] /markets wallet ...
//   Routes may leave out the leading slash ("home" is /), which also keeps Git Bash
//   from turning them into Windows paths.
//   --fresh   reset the demo data first, so the page matches its board's state
//   --verified  confirm the user's email first, so no verify banner shows

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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
const ACCOUNTS = { demo: ['demo@orichal.app', 'orichal-demo', '123456'], admin: ['admin@orichal.app', 'orichal-demo', null] };

const freePort = () => new Promise((resolve) => {
  const srv = createServer();
  srv.listen(0, () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

async function startServer(port) {
  const child = spawn(process.execPath, [join(root, 'node_modules', 'serve', 'build', 'main.js'), 'client', '--listen', String(port), '--no-clipboard'], { cwd: root, stdio: 'pipe' });
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('The dev server did not start');
}

async function signIn(page, base) {
  await page.goto(`${base}/`);
  await page.waitForSelector('.app-header, .auth-layout');
  if (fresh) {
    await page.evaluate(async () => {
      const server = await import('/src/models/api/mock/server.js');
      await server.resetDemo();
    });
  }
  if (as === 'guest') return;
  const [email, password, code] = ACCOUNTS[as];
  await page.evaluate(async ([e, p, c]) => {
    const { handle } = await import('/src/models/api/mock/server.js');
    const first = await handle({ method: 'POST', path: '/auth/login', body: { email: e, password: p } });
    if (first.body.data.requires2fa) {
      await handle({ method: 'POST', path: '/auth/login/2fa', body: { loginTicket: first.body.data.loginTicket, code: c } });
    }
  }, [email, password, code]);
  if (verified) await confirmEmail(page, email);
}

// --verified: confirm the signed-in user's email first, so the verify banner
// doesn't push the page down (the boards other than Profile draw it confirmed).
async function confirmEmail(page, email) {
  await page.evaluate(async (address) => {
    const { db, persist } = await import('/src/models/api/mock/db.js');
    const me = db().users.find((u) => u.email === address);
    if (me) me.emailVerified = true;
    persist();
    await new Promise((r) => setTimeout(r, 400));
  }, email);
}


const port = await freePort();
const server = await startServer(port);
const base = `http://localhost:${port}`;
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
  server.kill();
}
