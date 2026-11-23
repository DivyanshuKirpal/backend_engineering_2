// The store: the server's working set of the demo data, kept in memory and
// saved to a JSON file (STORE_FILE) so it survives a restart. Moved from the
// mock's db.js, which kept it in the browser's localStorage.
//
// The first start (or a reset) begins from the seed data (seed.js). Later
// starts load the saved file, so the demo data keeps ageing like a live
// account. Market data (tickers, books, public trades, candles) isn't saved
// here: the market simulator restarts it from the seed files each time the
// server starts.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { VERSION, buildSeed } from './seed.js';

function readStored() {
  try {
    const stored = JSON.parse(readFileSync(env.STORE_FILE, 'utf8'));
    return stored?.meta?.version === VERSION ? stored : null;
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[store] ${env.STORE_FILE} couldn't be read (${err.message}), so the demo data starts again from the seed files`);
    return null;
  }
}

let data = null;
let saveTimer = null;

/** Loads the saved file, or seeds a fresh copy when there is none. */
export async function open() {
  if (data) return data;
  data = readStored() ?? (await buildSeed());
  data.refreshTokens ??= {};
  saveNow();
  return data;
}

export function db() {
  if (!data) throw new Error('The store is not open yet');
  return data;
}

/** Saves soon: 200 ms after the last change, so a burst of changes is written once. */
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 200);
}

/**
 * Saves now. It writes a temporary file and then renames it over STORE_FILE,
 * so a crash halfway through never leaves half a file behind. A failed save
 * keeps the data in memory, and the next change tries again.
 */
export function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!data) return;
  try {
    mkdirSync(dirname(env.STORE_FILE), { recursive: true });
    const temp = `${env.STORE_FILE}.tmp`;
    writeFileSync(temp, JSON.stringify(data));
    renameSync(temp, env.STORE_FILE);
  } catch (err) {
    console.error(`[store] couldn't save ${env.STORE_FILE}: ${err.message}`);
  }
}

/** Throws the demo data away and seeds it again from the JSON files. */
export async function reset() {
  data = await buildSeed();
  saveNow();
  return data;
}

/**
 * A new id: a 24-character hex ObjectId. Within one process they ascend (a
 * timestamp, then a counter), so sorting by id is sorting by creation.
 */
export const newId = () => new mongoose.Types.ObjectId().toString();

export function uuid() {
  return crypto.randomUUID();
}
