// Turns the digitised Trade board chart into candles.BTC-USDT.15m.json.
// candles.ps1 read the chart off a crop of the Trade board (screens page 4)
// and printed candles-raw.txt, the input here.
//
// Kept as a record of how the data was made. The committed JSON is the source
// of truth now (npm run check:data guards it), so this writes to a folder you
// name, never over client/src/models/data.
// Usage: node scripts/data/make-candles.mjs scripts/data/candles-raw.txt <out dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [rawFile, outArg] = process.argv.slice(2);
if (!rawFile || !outArg) {
  console.error('Usage: node scripts/data/make-candles.mjs <candles-raw.txt> <out dir>, outside client/src/models/data');
  process.exit(1);
}
const outDir = resolve(outArg);
if (outDir === resolve(root, 'client', 'src', 'models', 'data')) {
  console.error('That is the committed data. Write somewhere else and compare.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const m = await import(pathToFileURL(join(root, 'client', 'src', 'models', 'domain', 'money.js')).href);

const rows = readFileSync(rawFile, 'utf8').trim().split(/\r?\n/).map((l) => {
  const [x, wt, wb, bt, bb, kind, n, vol] = l.trim().split(/\s+/);
  return { x: +x, wt: +wt, wb: +wb, bt: +bt, bb: +bb, kind, n: +n, vol: +vol };
});

// Merge fragments: runs whose centres are within 5 px belong to one candle.
const candles = [];
for (const r of rows) {
  const last = candles[candles.length - 1];
  if (last && r.x - last.xs[last.xs.length - 1] < 5) {
    last.xs.push(r.x);
    last.wt = Math.min(last.wt, r.wt);
    last.wb = Math.max(last.wb, r.wb);
    if (r.n >= 5) { last.bt = r.bt; last.bb = r.bb; }
    last.vol = Math.max(last.vol, r.vol);
    last.n += r.n;
    if (r.n > last.mainN) { last.kind = r.kind; last.mainN = r.n; }
  } else {
    candles.push({ ...r, xs: [r.x], mainN: r.n });
  }
}

const priceAt = (y) => 62400 - (y - 217.8) / 0.2009;
const tick = (p) => m.fixed(String(Math.round(p * 100) / 100), 2);

const out = candles.map((c) => {
  // A cross with no body: open and close at the middle of the wick's thick part.
  let bodyTop = c.bt;
  let bodyBot = c.bb;
  if (!(bodyTop > 0 && bodyBot > 0) || bodyBot < bodyTop) {
    const mid = (c.wt + c.wb) / 2;
    bodyTop = mid - 0.5;
    bodyBot = mid + 0.5;
  }
  const up = c.kind === 'g';
  const high = priceAt(c.wt);
  const low = priceAt(c.wb);
  const top = priceAt(bodyTop);
  const bottom = priceAt(bodyBot);
  return { up, open: up ? bottom : top, close: up ? top : bottom, high, low, vol: c.vol, x: c.xs.reduce((a, b) => a + b, 0) / c.xs.length };
});

// Volumes: the board's 168.37 BTC over 24 h is about 1.754 BTC per 15 minutes.
const withVol = out.filter((c) => c.vol > 0);
const avg = withVol.reduce((s, c) => s + c.vol, 0) / withVol.length;
const perPx = 1.754 / avg;
const lastOpen = Date.parse('2026-10-25T14:30:00Z') / 1000;
const result = out.map((c, i) => {
  const time = lastOpen - (out.length - 1 - i) * 900;
  const vol = (c.vol > 0 ? c.vol : avg * 0.3) * perPx;
  return {
    time,
    open: tick(c.open),
    high: tick(Math.max(c.high, c.open, c.close)),
    low: tick(Math.min(c.low, c.open, c.close)),
    close: tick(c.close),
    volume: m.fixed(String(Math.round(vol * 100000) / 100000), 5),
  };
});
// The forming candle as the board prints it: O, H, L, C.
Object.assign(result[result.length - 1], { open: '62098.20', high: '62166.00', low: '62071.40', close: '62140.50' });
// The 14:15 candle: the sell order 66F3·A512 filled at 62,400.00 at 14:21:07, so its high reaches 62,400.
const fillCandle = result[result.length - 2];
if (m.lt(fillCandle.high, '62400.00')) fillCandle.high = '62400.00';

writeFileSync(join(outDir, 'candles.BTC-USDT.15m.json'), JSON.stringify({ success: true, data: { candles: result } }, null, 2) + '\n');
console.log(`${result.length} candles, ${new Date(result[0].time * 1000).toISOString()} to ${new Date(result[result.length - 1].time * 1000).toISOString()}, avg volume ${(result.reduce((s, c) => s + Number(c.volume), 0) / result.length).toFixed(3)} BTC`);
console.log(result.slice(-3));
