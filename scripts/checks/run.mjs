// Runs the behaviour checks in this folder one file at a time: all of them
// (npm run checks) or the ones named (npm run checks -- trade admin-users).
// Each file prints its failures and its count. Flags such as --shots pass
// through to every file.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const named = args.filter((a) => !a.startsWith('--'));
const all = readdirSync(here).filter((f) => f.endsWith('.check.mjs')).map((f) => f.replace(/\.check\.mjs$/, '')).sort();

const unknown = named.filter((n) => !all.includes(n));
if (unknown.length) {
  console.error(`No check called ${unknown.join(', ')}. The checks are: ${all.join(', ')}`);
  process.exit(1);
}

const run = named.length ? named : all;
const failed = [];
for (const name of run) {
  const { status } = spawnSync(process.execPath, [join(here, `${name}.check.mjs`), ...flags], { stdio: 'inherit', cwd: join(here, '..', '..') });
  if (status !== 0) failed.push(name);
}
if (run.length > 1) console.log(failed.length ? `\n${failed.length} of ${run.length} files failed: ${failed.join(', ')}` : `\nAll ${run.length} files passed.`);
process.exitCode = failed.length ? 1 : 0;
