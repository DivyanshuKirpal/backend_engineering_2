// Cuts each design board out of the two PDFs, so a single board can be opened
// without a PDF renderer (pdftoppm isn't installed). Every PDF page is one
// DCTDecode (JPEG) image at 3x the board's CSS size, copied out as it is, under
// an invisible text layer. The text layer is written next to the image: one run
// per line with x, baseline y and font size in the board's CSS px, then the text.
//
// Usage: npm run boards   -> .boards/<pdf>-pNN-<board>.jpg and .txt (git-ignored)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.boards');

// Page index, as in section 8 of the architecture doc.
const sources = [
  {
    file: join(root, 'ui_design', 'Orichal.pdf'),
    prefix: 'components',
    boards: ['app-header', 'app-footer', 'admin-sidebar', 'ui-kit-1', 'ui-kit-2'],
  },
  {
    file: join(root, 'ui_design', 'Orichal (1).pdf'),
    prefix: 'screens',
    boards: [
      'home', 'home-footer', 'markets', 'trade', 'trade-phone', 'wallet', 'deposit', 'withdraw',
      'history', 'orders', 'login', 'login-2fa', 'register', 'profile', 'security', 'verification',
      'admin-dashboard', 'admin-users', 'admin-kyc', 'admin-withdrawals', 'admin-system',
    ],
  },
];

const LETTER_WIDTH = 612; // letter pages hold a 1440 px board scaled to fit

function readStream(buf, text, start) {
  const head = text.slice(start, start + 600);
  const length = Number(head.match(/\/Length (\d+)/)[1]);
  let data = text.indexOf('stream', start) + 'stream'.length;
  if (text[data] === '\r') data++;
  if (text[data] === '\n') data++;
  const bytes = buf.subarray(data, data + length);
  return { head, bytes: /\/FlateDecode/.test(head) ? inflateSync(bytes) : bytes };
}

function textRuns(ops, pageHeight, scale) {
  const decode = (hex) => {
    let out = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCodePoint(parseInt(hex.slice(i, i + 4), 16));
    return out;
  };
  let size = 0, x = 0, y = 0;
  const lines = [];
  const re = /([\d.-]+) Tf|1 0 0 1 ([\d.-]+) ([\d.-]+) Tm|<([0-9a-fA-F]*)> Tj|\[([^\]]*)\] TJ/g;
  for (const m of ops.matchAll(re)) {
    if (m[1] !== undefined) size = Number(m[1]);
    else if (m[2] !== undefined) { x = Number(m[2]); y = Number(m[3]); }
    else {
      const str = m[4] !== undefined ? decode(m[4]) : [...m[5].matchAll(/<([0-9a-fA-F]*)>/g)].map((t) => decode(t[1])).join('');
      const cols = [x * scale, (pageHeight - y) * scale, size * scale].map((n) => n.toFixed(1).padStart(7));
      lines.push(`${cols.join(' ')}  ${str}`);
    }
  }
  return lines.join('\n') + '\n';
}

function extract({ file, prefix, boards }) {
  const buf = readFileSync(file);
  const text = buf.toString('latin1');

  const objAt = new Map();
  for (const m of text.matchAll(/(\d+) 0 obj/g)) objAt.set(Number(m[1]), m.index);
  const body = (num) => text.slice(objAt.get(num), text.indexOf('endobj', objAt.get(num)));

  const kids = text.match(/\/Type \/Pages \/Kids \[([^\]]*)\]/)[1];
  const pages = [...kids.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  if (pages.length !== boards.length) {
    throw new Error(`${file}: expected ${boards.length} pages, found ${pages.length}`);
  }

  pages.forEach((pageObj, i) => {
    const page = body(pageObj);
    const name = `${prefix}-p${String(i + 1).padStart(2, '0')}-${boards[i]}`;

    const image = readStream(buf, text, objAt.get(Number(page.match(/\/Im0 (\d+) 0 R/)[1])));
    if (image.bytes[0] !== 0xff || image.bytes[1] !== 0xd8) throw new Error(`${name}: not a JPEG`);
    writeFileSync(join(outDir, `${name}.jpg`), image.bytes);

    const [, , boxWidth, boxHeight] = page.match(/\/MediaBox \[([^\]]*)\]/)[1].split(/\s+/).map(Number);
    const scale = boxWidth === LETTER_WIDTH ? 1440 / LETTER_WIDTH : 4 / 3;
    const contents = Number(page.match(/\/Contents (\d+) 0 R/)[1]);
    const ops = readStream(buf, text, objAt.get(contents)).bytes.toString('latin1');
    writeFileSync(join(outDir, `${name}.txt`), textRuns(ops, boxHeight, scale));

    const size = `${image.head.match(/\/Width (\d+)/)[1]}x${image.head.match(/\/Height (\d+)/)[1]}`;
    console.log(`${name}  ${size}`);
  });
}

mkdirSync(outDir, { recursive: true });
sources.forEach(extract);
console.log(`Boards and text layers written to ${outDir}`);
