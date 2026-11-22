// Copies the self-hosted fonts, the QR encoder and the Socket.IO client out of
// node_modules into client/assets. The copies are committed, so the client runs
// without node_modules or a build step; run this again only to update them.
//
// Usage: npm run vendor

import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const assets = join(root, 'client', 'assets');

const fonts = [
  ['@fontsource/barlow-semi-condensed', 'barlow-semi-condensed', [400, 500, 600, 700]],
  ['@fontsource/azeret-mono', 'azeret-mono', [400, 500, 600]],
];

mkdirSync(join(assets, 'fonts'), { recursive: true });
for (const [pkg, family, weights] of fonts) {
  for (const weight of weights) {
    const file = `${family}-latin-${weight}-normal.woff2`;
    copyFileSync(join(modules, pkg, 'files', file), join(assets, 'fonts', file));
    console.log(`fonts/${file}`);
  }
}

mkdirSync(join(assets, 'vendor'), { recursive: true });
copyFileSync(join(modules, 'qrcode-generator', 'dist', 'qrcode.mjs'), join(assets, 'vendor', 'qrcode-generator.mjs'));
console.log('vendor/qrcode-generator.mjs');

// The Socket.IO client's ES module build (MIT), which models/realtime/socket.js
// imports, and its source map, so DevTools can show the readable code.
for (const file of ['socket.io.esm.min.js', 'socket.io.esm.min.js.map']) {
  copyFileSync(join(modules, 'socket.io-client', 'dist', file), join(assets, 'vendor', file));
  console.log(`vendor/${file}`);
}
