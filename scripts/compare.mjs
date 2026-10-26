// Compares a page's text with a design board's text layer (from npm run boards):
// for every run on the board it finds the same words in the page and prints
// the offsets in px (left edge, baseline, font size). Runs off by more than
// 2 px across, 3 px down, or in size are flagged.
//
// Usage: npm run compare -- <route> <board> [--as=demo|admin|guest] [--width=1440]
//          [--height=920] [--fresh] [--verified] [--kyc=none] [--all] [--only=from:to] [--align=<selector>:<boardY>]
//   <board>  a name in .boards/ without .txt, e.g. screens-p03-markets
//   --only   keep board runs whose baseline is in that range
//   --dx     move the page this many px sideways before matching
//   --align  shift the page so that element's top sits at that board y
//            (to compare a region, e.g. --align=.app-footer:652)
//   --fill=<selector>=<text>, --click=<selector>, --wait-for=<selector>
//            steps run in order once the page has loaded, to reach the
//            state a board draws (the sign-in code step, an open drawer)

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const [routeArg, boardName] = args.filter((a) => !a.startsWith('--'));
if (!routeArg || !boardName) {
  console.error('Usage: npm run compare -- <route> <board> [--as=demo] (run npm run boards first)');
  process.exit(1);
}
const route = routeArg === 'home' ? '/' : routeArg.startsWith('/') ? routeArg : `/${routeArg}`;
const as = flag('as', 'guest');
const width = Number(flag('width', '1440'));
// The window's height: centred pages (the sign-in boards are 900 and 960 px tall) need the board's own
const height = Number(flag('height', '920'));
const wait = Number(flag('wait', '800'));
const only = flag('only', null)?.split(':').map(Number);
const align = flag('align', null);
// Shifts the page sideways before matching (the Deposit board was drawn 1425 px wide, leaving room for a scrollbar)
const dx = Number(flag('dx', '0'));
const showAll = args.includes('--all');
const fresh = args.includes('--fresh');
const verified = args.includes('--verified');
const kyc = flag('kyc', '');
const ACCOUNTS = { demo: ['demo@orichal.app', 'orichal-demo', '123456'], admin: ['admin@orichal.app', 'orichal-demo', null] };
const steps = args.filter((a) => /^--(fill|click|wait-for)=/.test(a)).map((a) => {
  const [, kind, rest] = /^--(fill|click|wait-for)=(.*)$/.exec(a);
  if (kind !== 'fill') return { kind, selector: rest };
  const cut = rest.lastIndexOf('=');
  return { kind, selector: rest.slice(0, cut), text: rest.slice(cut + 1) };
});

const board = readFileSync(join(root, '.boards', `${boardName}.txt`), 'utf8').trim().split('\n').map((line) => {
  const m = /^\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s{2}(.*)$/.exec(line);
  return m && { x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), text: m[4].trim() };
}).filter((r) => r && r.text && (!only || (r.y >= only[0] && r.y <= only[1])));

const port = await new Promise((resolve) => {
  const srv = createServer();
  srv.listen(0, () => srv.close(() => resolve(srv.address()?.port ?? 5397)));
}).catch(() => 5397);
const server = spawn(process.execPath, [join(root, 'node_modules', 'serve', 'build', 'main.js'), 'client', '--listen', String(port), '--no-clipboard'], { cwd: root, stdio: 'ignore' });
const base = `http://localhost:${port}`;
for (let i = 0; i < 50; i += 1) {
  try {
    if ((await fetch(`${base}/`)).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
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

// --kyc=<status>: set the signed-in user's identity check first, for boards
// drawn at another moment (Verification shows Not started; the demo trader is
// approved). "none" also drops their applications.
async function setKyc(page, email, status) {
  await page.evaluate(async ([address, value]) => {
    const { db, persist } = await import('/src/models/api/mock/db.js');
    const me = db().users.find((u) => u.email === address);
    if (me) {
      me.kycStatus = value;
      if (value === 'none') db().kyc = db().kyc.filter((k) => k.userId !== me.id);
    }
    persist();
    await new Promise((r) => setTimeout(r, 400));
  }, [email, status]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`${base}/`);
  await page.waitForSelector('.app-header, .auth-layout');
  if (fresh) await page.evaluate(async () => (await import('/src/models/api/mock/server.js')).resetDemo());
  if (as !== 'guest') {
    await page.evaluate(async ([e, p, c]) => {
      const { handle } = await import('/src/models/api/mock/server.js');
      const first = await handle({ method: 'POST', path: '/auth/login', body: { email: e, password: p } });
      if (first.body.data.requires2fa) await handle({ method: 'POST', path: '/auth/login/2fa', body: { loginTicket: first.body.data.loginTicket, code: c } });
    }, ACCOUNTS[as]);
    if (verified) await confirmEmail(page, ACCOUNTS[as][0]);
    if (kyc) await setKyc(page, ACCOUNTS[as][0], kyc);
  }
  await page.goto(`${base}${route}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(wait);
  for (const s of steps) {
    if (s.kind === 'fill') await page.fill(s.selector, s.text);
    else if (s.kind === 'click') await page.click(s.selector);
    else await page.waitForSelector(s.selector);
  }
  if (steps.length) await page.waitForTimeout(wait);

  let shift = 0;
  if (align) {
    const cut = align.lastIndexOf(':');
    const top = await page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().top + scrollY, align.slice(0, cut));
    shift = Number(align.slice(cut + 1)) - top;
  }

  const dom = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue.replace(/\s+/g, ' ').trim();
      const el = node.parentElement;
      if (!text || !el) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = [...range.getClientRects()].find((x) => x.width > 0);
      if (!r) continue;
      const size = parseFloat(cs.fontSize);
      // Baseline of the first line: the line box's bottom less the font's descent (about 0.22 em).
      out.push({ text, x: r.left + scrollX, y: r.bottom + scrollY - (r.height - size) / 2 - size * 0.22, size, weight: cs.fontWeight });
    }
    return out;
  });
  for (const d of dom) {
    d.y += shift;
    d.x += dx;
  }

  const norm = (s) => s.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").trim().toLowerCase();
  const used = new Set();
  let flagged = 0;
  console.log('  board x      y  size |  page x      y  size  wt |    dx    dy   ds | text');
  for (const b of board) {
    let bt = norm(b.text);
    const find = (t) => dom.filter((d, i) => !used.has(i) && (norm(d.text) === t || norm(d.text).startsWith(t) || (t.length > 6 && norm(d.text).includes(t))));
    let candidates = find(bt);
    if (!candidates.length && /^[▲▼]/.test(bt)) {
      bt = bt.replace(/^[▲▼]\s*/, '');
      candidates = find(bt);
    }
    if (!candidates.length) {
      // A later line of a paragraph whose first line was already matched.
      const wrapped = dom.some((d, i) => used.has(i) && norm(d.text).includes(bt));
      if (wrapped) {
        if (showAll) console.log(`${b.x.toFixed(1).padStart(7)} ${b.y.toFixed(1).padStart(6)} ${String(b.size).padStart(5)} |   (wrapped line)                |                  | ${bt.slice(0, 60)}`);
        continue;
      }
      flagged += 1;
      console.log(`${b.x.toFixed(1).padStart(7)} ${b.y.toFixed(1).padStart(6)} ${String(b.size).padStart(5)} |   not found                     |                  | ${bt.slice(0, 60)}`);
      continue;
    }
    const best = candidates.reduce((a, d) => (Math.hypot(d.x - b.x, d.y - b.y) < Math.hypot(a.x - b.x, a.y - b.y) ? d : a));
    used.add(dom.indexOf(best));
    const dx = best.x - b.x;
    const dy = best.y - b.y;
    const ds = best.size - b.size;
    const bad = Math.abs(dx) > 2 || Math.abs(dy) > 3 || Math.abs(ds) > 0.4;
    if (bad) flagged += 1;
    if (bad || showAll) {
      console.log(`${b.x.toFixed(1).padStart(7)} ${b.y.toFixed(1).padStart(6)} ${String(b.size).padStart(5)} | ${best.x.toFixed(1).padStart(7)} ${best.y.toFixed(1).padStart(6)} ${String(best.size).padStart(5)} ${String(best.weight).padStart(3)} | ${dx.toFixed(1).padStart(5)} ${dy.toFixed(1).padStart(5)} ${ds.toFixed(1).padStart(4)} | ${bt.slice(0, 60)}${bad ? '  <-' : ''}`);
    }
  }
  console.log(`${board.length} board runs; ${flagged} flagged`);
} finally {
  await browser.close();
  server.kill();
}
