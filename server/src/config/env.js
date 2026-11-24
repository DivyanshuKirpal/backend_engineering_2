// The server's settings, read once at start-up. First server/.env is loaded
// into process.env if it exists; variables already set in the real environment
// win over the file, so the checks can pass their own PORT and STORE_FILE.
// Then Zod checks every value. A bad one stops the server here with a message
// naming the variable, instead of failing later inside some request.
//
// docs/server-plan.md section 5 lists the variables; server/.env.example has a
// safe example of each. Every variable has a default for local development
// except the two JWT secrets: a default anybody can read would let anybody sign.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rootDir = resolve(serverDir, '..');

try {
  process.loadEnvFile(resolve(serverDir, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err; // no server/.env: the defaults below apply
}

/** "true" or "false" in the environment, a boolean in the code. */
const flag = (fallback) => z.enum(['true', 'false']).default(fallback).transform((v) => v === 'true');

const MAKE_ONE = 'Make one with: node -e "console.log(require(\'node:crypto\').randomBytes(48).toString(\'base64url\'))"';
const secret = z.string(`is not set. ${MAKE_ONE}`).min(32, `must be at least 32 characters. ${MAKE_ONE}`);

const duration = z.string().regex(/^\d+[smhd]$/, 'must be a number followed by s, m, h or d, such as 15m or 7d');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5173),
  MONGO_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://')
    .default('mongodb://127.0.0.1:27017/orichal'),
  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: secret,
  ACCESS_TOKEN_TTL: duration.default('15m'),
  REFRESH_TOKEN_TTL: duration.default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // Money stays a string, as everywhere else: never a Number.
  DEMO_CREDIT_USDT: z.string().regex(/^\d+(\.\d+)?$/, 'must be a decimal amount such as 10000').default('10000'),
  // Relative paths are taken from the repository root, wherever the server is started from.
  STORE_FILE: z.string().default('server/data/store.json').transform((p) => resolve(rootDir, p)),
  SEED_ON_START: flag('false'),
  DEMO_CONTROLS: flag('true'),
  DEMO_LATENCY: flag('false'),
  TEST_ROUTES: flag('false'),
}).refine((e) => e.JWT_ACCESS_SECRET !== e.JWT_REFRESH_SECRET, {
  path: ['JWT_REFRESH_SECRET'],
  message: 'must be different from JWT_ACCESS_SECRET',
});

// An empty value (NAME= in the file) counts as not set, so its default applies.
const given = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));
const parsed = schema.safeParse(given);

if (!parsed.success) {
  // Names and rules only: a value is never printed, since it may be a secret.
  const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  console.error([
    'Orichal can\'t start: a setting in server/.env or the environment is invalid.',
    ...lines,
    'server/.env.example lists every variable with a safe example.',
  ].join('\n'));
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
