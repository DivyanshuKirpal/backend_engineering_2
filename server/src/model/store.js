// The store: the server's working set. The engine, the simulator and the
// handlers change these records in memory, synchronously, as real exchanges
// keep their books; the store makes every change permanent:
//
//   - users, sessions, balances (wallets), ledger, orders and fills (trades)
//     live in MongoDB. They are loaded at start, and flush() writes what
//     changed since the last flush.
//   - the rest (transactions, KYC, notifications, audit logs, …) lives in
//     STORE_FILE until the final evaluation.
//
// flush() compares each record with the copy it last wrote and sends one
// bulkWrite per collection, $set-ing only the fields that changed. It never
// replaces a document: the records don't hold passwordHash, so a replace would
// wipe it. The adapter awaits a flush before it answers any request that isn't
// a GET; background changes (the engine filling an order) go through
// persist(), which flushes 200 ms later. Flushes run one at a time.
//
// Market data (tickers, books, candles) isn't stored: the simulator restarts it
// from the seed files each time the server starts.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import mongoose from 'mongoose';
import { connectDb, explainConnection } from '../config/db.js';
import { env } from '../config/env.js';
import { MODELS, changedPaths, fieldsThatDiffer, filterOf, keyOf, toRecord } from './documents.js';
import { FILE_KEYS, VERSION, buildSeed, seedDatabase } from './seed.js';

const COLLECTIONS = Object.keys(MODELS);
const FLUSH_DELAY = 200;
const RETRY_DELAY = 5000;

// How each collection is loaded: in the order it was written.
const SORT = {
  users: { createdAt: -1, _id: -1 },
  sessions: { createdAt: 1, _id: 1 },
  balances: { _id: 1 },
  ledger: { time: 1, _id: 1 },
  orders: { createdAt: 1, _id: 1 },
  fills: { time: 1, _id: 1 },
};

let data = null;
let written = {}; // collection -> Map(record key -> the record as MongoDB has it, as JSON)
let fileText = null; // what STORE_FILE holds
let timer = null;
let queue = Promise.resolve(); // flushes and resets, one after another
let failure = null; // why the last flush failed, for /health

// ---------------------------------------------------------------- opening
/** Connects, loads the working set and returns it. Seeds an empty database first when SEED_ON_START is on. */
export async function open() {
  if (data) return data;
  try {
    await connectDb();
  } catch (err) {
    throw new Error(explainConnection(err));
  }
  // Unique indexes must exist before the first write
  await Promise.all(Object.values(MODELS).map((Model) => Model.init()));
  if ((await MODELS.users.estimatedDocumentCount()) === 0) {
    if (!env.SEED_ON_START) {
      throw new Error(`The database "${mongoose.connection.name}" is empty. Run npm run seed first (or set SEED_ON_START=true).`);
    }
    return reset();
  }
  data = { ...(await readFile()), ...(await loadCollections()) };
  writeFile();
  return data;
}

async function loadCollections() {
  const loaded = {};
  for (const collection of COLLECTIONS) {
    // lean(): plain objects instead of Mongoose documents, several times faster
    const docs = await MODELS[collection].find().sort(SORT[collection]).lean();
    loaded[collection] = docs.map((doc) => toRecord(collection, doc));
    written[collection] = new Map(loaded[collection].map((record) => [keyOf(collection, record), JSON.stringify(record)]));
  }
  return loaded;
}

/** The collections kept in STORE_FILE; a fresh copy of them when the file is missing or unreadable. */
async function readFile() {
  try {
    const stored = JSON.parse(readFileSync(env.STORE_FILE, 'utf8'));
    if (stored?.meta?.version === VERSION) return Object.fromEntries(FILE_KEYS.map((key) => [key, stored[key]]));
    console.warn(`[store] ${env.STORE_FILE} is from another version, so its collections start again from the seed files.`);
  } catch (err) {
    console.warn(err.code === 'ENOENT'
      ? `[store] ${env.STORE_FILE} is missing, so its collections start from the seed files. Run npm run seed to reset MongoDB with them.`
      : `[store] ${env.STORE_FILE} couldn't be read (${err.message}), so its collections start again from the seed files.`);
  }
  const fresh = await buildSeed();
  return Object.fromEntries(FILE_KEYS.map((key) => [key, fresh[key]]));
}

export function db() {
  if (!data) throw new Error('The store is not open yet');
  return data;
}

// ---------------------------------------------------------------- saving
/** Saves soon: a flush 200 ms from now, unless one is already on its way. */
export function persist() {
  timer ??= setTimeout(flush, FLUSH_DELAY);
}

/** Writes every change since the last flush. Resolves when they are in MongoDB (or a retry is scheduled). */
export function flush() {
  clearTimeout(timer);
  timer = null;
  queue = queue.then(writeChanges);
  return queue;
}

async function writeChanges() {
  if (!data) return;
  const results = await Promise.allSettled(COLLECTIONS.map(writeCollection));
  writeFile();
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) {
    // Nothing is lost: what wasn't written still differs from its last copy, so the next flush sends it again.
    failure = failed.reason.message;
    console.error(`[store] a flush failed and will be retried: ${failure}`);
    timer ??= setTimeout(flush, RETRY_DELAY);
  } else {
    failure = null;
  }
}

async function writeCollection(collection) {
  const copies = written[collection];
  const operations = [];
  const sent = [];
  for (const record of data[collection]) {
    const key = keyOf(collection, record);
    const json = JSON.stringify(record);
    const copy = copies.get(key);
    if (copy === json) continue;
    const changes = changedPaths(collection, record, copy && JSON.parse(copy));
    if (!Object.keys(changes).length) {
      copies.set(key, json); // nothing that is stored changed
      continue;
    }
    sent.push([key, json]);
    // A new record is inserted (an upsert). A known one is only updated: upserting a few changed
    // fields of a document that is gone, such as an expired session, would create half a document.
    operations.push({ updateOne: { filter: filterOf(collection, record), update: { $set: changes }, upsert: !copy } });
  }
  if (!operations.length) return;
  try {
    await MODELS[collection].bulkWrite(operations, { ordered: false, throwOnValidationError: true });
    for (const [key, json] of sent) copies.set(key, json);
  } catch (err) {
    // The server names the operations it refused; the others went through.
    if (err.writeErrors?.length) {
      const refused = new Set(err.writeErrors.map((e) => e.index));
      sent.forEach(([key, json], i) => { if (!refused.has(i)) copies.set(key, json); });
    }
    throw err;
  }
}

/** The state of the last flush, for GET /health. */
export const flushState = () => (failure ? `failing: ${failure}` : 'ok');

/**
 * Saves STORE_FILE if it changed: a temporary file first, then a rename over
 * the real one, so a crash halfway through never leaves half a file.
 */
export function writeFile() {
  if (!data) return;
  const text = JSON.stringify(Object.fromEntries(FILE_KEYS.map((key) => [key, data[key]])));
  if (text === fileText) return;
  try {
    mkdirSync(dirname(env.STORE_FILE), { recursive: true });
    const temp = `${env.STORE_FILE}.tmp`;
    writeFileSync(temp, text);
    renameSync(temp, env.STORE_FILE);
    fileText = text;
  } catch (err) {
    console.error(`[store] couldn't save ${env.STORE_FILE}: ${err.message}`);
  }
}

/**
 * Takes in a record that was just written to MongoDB directly (sign-in does).
 * Only the fields that changed there since the last flush are copied over, so
 * a change the working set hasn't flushed yet isn't undone; and nothing is
 * written twice. Returns the working set's own record.
 */
export function remember(collection, record) {
  const key = keyOf(collection, record);
  const copies = written[collection];
  const mine = data[collection].find((r) => keyOf(collection, r) === key);
  const copy = copies.has(key) ? JSON.parse(copies.get(key)) : null;
  if (!mine) {
    if (collection === 'users') data.users.unshift(record);
    else data[collection].push(record);
    copies.set(key, JSON.stringify(record));
    return record;
  }
  const base = copy ?? {};
  for (const field of fieldsThatDiffer(collection, record, base)) {
    mine[field] = record[field];
    base[field] = record[field];
  }
  copies.set(key, JSON.stringify(base));
  return mine;
}

/** Throws the data away and seeds MongoDB and STORE_FILE again. Waits for a flush under way; later ones wait for it. */
export function reset() {
  clearTimeout(timer);
  timer = null;
  const done = queue.then(async () => {
    const fresh = await buildSeed();
    await seedDatabase(fresh);
    data = fresh;
    for (const collection of COLLECTIONS) {
      written[collection] = new Map(data[collection].map((record) => [keyOf(collection, record), JSON.stringify(record)]));
    }
    writeFile();
    return data;
  });
  queue = done.catch(() => {}); // a failed reset is the caller's to handle; the queue goes on
  return done;
}

/**
 * A new id: a 24-character hex ObjectId. Within one process they ascend (a
 * timestamp, then a counter), so sorting by id is sorting by creation.
 */
export const newId = () => new mongoose.Types.ObjectId().toString();
