// Shared set-up for the behaviour checks in this folder (Playwright). Starts
// the dev server on a spare port as screenshots.mjs does, opens one page,
// signs in through the mock API, and counts the checks: it prints only the
// failures, then one line with the file's count.
//
// A check file:
//   const { page, base, check, fail, finish, signIn } = await start();
//   try { await signIn('demo'); ...; check('label', condition, extra); }
//   catch (err) { fail(err); } finally { await finish(); }

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ACCOUNTS = { demo: ['demo@orichal.app', 'orichal-demo', '123456'], admin: ['admin@orichal.app', 'orichal-demo', null] };

const freePort = () => new Promise((resolve) => {
  const srv = createServer();
  srv.listen(0, () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

async function startServer(port) {
  // Its request log is never read, so it goes nowhere: an unread pipe fills up and stalls the server
  const child = spawn(process.execPath, [join(root, 'node_modules', 'serve', 'build', 'main.js'), 'client', '--listen', String(port), '--no-clipboard'], { cwd: root, stdio: 'ignore' });
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

/**
 * Starts one check file: the server, a browser and a page.
 * `--shots` on the command line gives `shots`, a folder for the screenshots
 * a few checks take (.screenshots/, git-ignored); without it they take none.
 */
export async function start({ viewport = { width: 1440, height: 900 }, permissions = [] } = {}) {
  const name = basename(process.argv[1]).replace(/\.check\.mjs$/, '');
  const port = await freePort();
  const server = await startServer(port);
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  if (permissions.length) await context.grantPermissions(permissions, { origin: base });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

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

  /**
   * Signs in through the mock API as 'demo' or 'admin' (or stays a 'guest').
   * fresh: reset the demo data first; otherwise end the current session.
   * kyc: set the user's identity check first ('none' also drops their applications).
   */
  const signIn = async (as, { fresh = true, kyc = null } = {}) => {
    if (!page.url().startsWith(base)) {
      await page.goto(`${base}/`);
      await page.waitForSelector('.app-header, .auth-layout');
    }
    await page.evaluate(async (reset) => {
      const s = await import('/src/models/api/mock/server.js');
      if (reset) await s.resetDemo();
      else await s.handle({ method: 'POST', path: '/auth/logout' });
    }, fresh);
    if (as === 'guest') return;
    const [email, password, code] = ACCOUNTS[as];
    await page.evaluate(async ([e, p, c, status]) => {
      const s = await import('/src/models/api/mock/server.js');
      const first = await s.handle({ method: 'POST', path: '/auth/login', body: { email: e, password: p } });
      if (first.body.data.requires2fa) {
        await s.handle({ method: 'POST', path: '/auth/login/2fa', body: { loginTicket: first.body.data.loginTicket, code: c } });
      }
      if (status) {
        const { db, persist } = await import('/src/models/api/mock/db.js');
        const me = db().users.find((u) => u.email === e);
        me.kycStatus = status;
        if (status === 'none') db().kyc = db().kyc.filter((k) => k.userId !== me.id);
        persist();
      }
    }, [email, password, code, kyc]);
  };

  const finish = async () => {
    console.log(`${name}: ${ok} ok, ${bad} failed`);
    if (errors.length) console.log('  page errors:', errors.slice(0, 8));
    await browser.close();
    server.kill();
    process.exitCode = bad ? 1 : 0;
  };

  return { page, context, base, shots, check, fail, signIn, finish };
}
