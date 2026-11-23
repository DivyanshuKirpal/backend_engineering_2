// Shared set-up for the behaviour checks in this folder (Playwright). Starts
// the Express server (server/src/server.js) on a spare port with its own
// temporary store file and the demo controls, the test routes and the
// simulated network delay switched on; opens one page; signs in through the
// API; and counts the checks: it prints only the failures, then one line with
// the file's count. screenshots.mjs and compare.mjs start the same server.
//
// A check file:
//   const { page, base, check, fail, finish, signIn, snapshot } = await start();
//   try { await signIn('demo'); ...; check('label', condition, extra); }
//   catch (err) { fail(err); } finally { await finish(); }

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ACCOUNTS = { demo: ['demo@orichal.app', 'orichal-demo', '123456'], admin: ['admin@orichal.app', 'orichal-demo', null] };

const freePort = () => new Promise((resolve) => {
  const srv = createServer();
  srv.listen(0, () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

/**
 * Starts the server on a spare port with a store file of its own, so every
 * check file begins from the seed data. Returns { base, stop }.
 */
export async function startServer() {
  const port = await freePort();
  const storeDir = mkdtempSync(join(tmpdir(), 'orichal-check-'));
  // Its request log is never read, so it goes nowhere: an unread pipe fills up and stalls the server
  const child = spawn(process.execPath, [join(root, 'server', 'src', 'server.js')], {
    cwd: root,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      STORE_FILE: join(storeDir, 'store.json'),
      // Never the database in server/.env: the checks reset the data. Nothing listens here.
      MONGO_URI: 'mongodb://127.0.0.1:1/orichal-checks',
      DEMO_CONTROLS: 'true',
      TEST_ROUTES: 'true',
      DEMO_LATENCY: 'true', // some checks look for loading states
    },
  });
  const base = `http://localhost:${port}`;
  const stop = () => {
    child.kill();
    try {
      rmSync(storeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows may hold the file a moment longer; a leftover temp folder is harmless
    }
  };
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode != null) break;
    try {
      const res = await fetch(`${base}/api/v1/health`);
      if (res.ok) return { base, stop };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  stop();
  throw new Error('The server did not start (try npm run dev to see why)');
}

/**
 * Signs a page in through the API as 'demo' or 'admin', or leaves it a 'guest'.
 * The calls run inside the page with fetch, so the rt cookie lands in the
 * browser; the next page load restores the session from it.
 *   fresh:    reset the demo data first; otherwise end the current session
 *   kyc:      set the user's identity check first ('none' also drops their applications)
 *   verified: confirm the user's email first, so the verify banner doesn't show
 */
export async function signInPage(page, base, as, { fresh = true, kyc = null, verified = false } = {}) {
  if (!page.url().startsWith(base)) {
    await page.goto(`${base}/`);
    await page.waitForSelector('.app-header, .auth-layout');
  }
  const [email, password, code] = ACCOUNTS[as] ?? [];
  await page.evaluate(async (o) => {
    const call = async (method, path, body) => {
      const res = await fetch(`/api/v1${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = res.status === 204 ? null : await res.json();
      if (!res.ok) throw new Error(`${method} ${path} answered ${res.status} ${json?.error?.code ?? ''}`);
      return json?.data;
    };
    await call('POST', o.fresh ? '/demo/reset' : '/auth/logout');
    if (!o.email) return;
    const first = await call('POST', '/auth/login', { email: o.email, password: o.password });
    if (first.requires2fa) await call('POST', '/auth/login/2fa', { loginTicket: first.loginTicket, code: o.code });
    if (o.kyc) await call('POST', '/demo/kyc-status', { email: o.email, status: o.kyc });
    if (o.verified) await call('POST', '/demo/email-verified', { email: o.email });
  }, { fresh, email, password, code, kyc, verified });
}

// The browser logs every 4xx answer, and the 503 that fail-next asks for, as
// "Failed to load resource". With a real server those are expected (a wrong
// password is a 401), so they aren't page errors; a 500 still is.
const EXPECTED_STATUS = /^Failed to load resource: the server responded with a status of (4\d\d|503)\b/;

/**
 * Starts one check file: the server, a browser and a page.
 * `--shots` on the command line gives `shots`, a folder for the screenshots
 * a few checks take (.screenshots/, git-ignored); without it they take none.
 * `browser: false` starts only the server, for checks that call the API alone.
 */
export async function start({ viewport = { width: 1440, height: 900 }, permissions = [], browser: withBrowser = true } = {}) {
  const name = basename(process.argv[1]).replace(/\.check\.mjs$/, '');
  const server = await startServer();
  const { base } = server;
  const browser = withBrowser ? await chromium.launch() : null;
  let context = null;
  let page = null;
  const errors = [];
  if (browser) {
    context = await browser.newContext({ viewport });
    if (permissions.length) await context.grantPermissions(permissions, { origin: base });
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED_STATUS.test(m.text())) errors.push(m.text()); });
  }

  let shots = null;
  if (process.argv.includes('--shots')) {
    shots = join(root, '.screenshots');
    mkdirSync(shots, { recursive: true });
  }

  let ok = 0;
  let bad = 0;
  const check = (label, cond, extra = '') => {
    if (cond) ok += 1;
    else {
      bad += 1;
      console.log(`  FAIL ${label}${extra === '' ? '' : `  ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`}`);
    }
  };
  const fail = (err) => {
    bad += 1;
    console.log(`  ERROR ${err.message.split('\n')[0]}`);
  };

  /** Calls the API from Node (no cookies): { status, body }. */
  const api = async (method, path, body, { token, headers = {} } = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
  };

  /** A read-only copy of the server's working set, or of some collections: snapshot('orders', 'audit'). */
  const snapshot = async (...only) => (await api('GET', `/demo/db${only.length ? `?only=${only.join(',')}` : ''}`)).body.data;

  /** The page's next API request answers 503 (the Simulator menu's switch, kept by this browser). */
  const failNext = () => page.evaluate(async () => (await fetch('/api/v1/demo/fail-next', { method: 'POST' })).ok);

  const signIn = (as, options) => signInPage(page, base, as, options);

  const finish = async () => {
    console.log(`${name}: ${ok} ok, ${bad} failed`);
    if (errors.length) console.log('  page errors:', errors.slice(0, 8));
    await browser?.close();
    server.stop();
    process.exitCode = bad ? 1 : 0;
  };

  return { page, context, base, shots, check, fail, signIn, api, snapshot, failNext, finish };
}
