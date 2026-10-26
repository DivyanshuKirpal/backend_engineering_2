// QrCode: the vendored MIT encoder (assets/vendor/qrcode-generator.mjs, in
// place of qrcode.react; section 8) drawn as one SVG path. The text it holds
// is printed beside it, so the picture carries a short label only.

import { s } from '../../dom.js';
import { qrcode } from '/assets/vendor/qrcode-generator.mjs';

const drawn = new Map();

function modules(text) {
  if (!drawn.has(text)) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    drawn.set(text, { n, d });
  }
  return drawn.get(text);
}

export function QrCode({ text, size = 143, label }) {
  const { n, d } = modules(text);
  return s('svg', {
    class: 'qr', width: size, height: size, viewBox: `0 0 ${n} ${n}`, role: 'img', 'aria-label': label, 'shape-rendering': 'crispEdges',
  }, s('path', { d }));
}
