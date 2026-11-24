// Between the working set's records and MongoDB's documents, for the six
// collections. A record is what the engine, the handlers and the API use: hex
// ids, decimal strings, ISO times. A document is what MongoDB stores:
// ObjectIds, Decimal128, Dates. Each table row is
//   [record field, document path, type]
// and the type says how the value converts; no type means it is stored as is.
//
// The paths are dotted ('twoFactor.enabled'), so an update can $set one nested
// field and leave its neighbours alone: setting `twoFactor` as a whole would
// wipe its codeHash, which the records never hold.

import mongoose from 'mongoose';
import * as money from '../../../client/src/models/domain/money.js';
import { fromDecimal, toDecimal, writtenDecimals } from '../lib/decimal.js';
import { LedgerEntry } from './schemas/LedgerEntry.js';
import { Order } from './schemas/Order.js';
import { Session } from './schemas/Session.js';
import { Trade } from './schemas/Trade.js';
import { User } from './schemas/User.js';
import { Wallet } from './schemas/Wallet.js';

const { ObjectId } = mongoose.Types;

/** The working set's collections that live in MongoDB, and their models. */
export const MODELS = { users: User, sessions: Session, balances: Wallet, ledger: LedgerEntry, orders: Order, fills: Trade };

/** The record fields that identify one record: what an upsert matches on. */
const KEYS = { users: ['id'], sessions: ['id'], balances: ['userId', 'asset'], ledger: ['id'], orders: ['id'], fills: ['id', 'orderId'] };

const CONVERT = {
  id: { to: (hex) => new ObjectId(hex), from: (id) => id.toString() },
  amount: { to: toDecimal, from: fromDecimal },
  date: { to: (iso) => new Date(iso), from: (date) => date.toISOString() },
  list: { to: (list) => [...list], from: (list) => [...list] },
};

const FIELDS = {
  users: [
    ['id', '_id', 'id'], ['email', 'email'], ['displayName', 'displayName'], ['role', 'role'], ['status', 'status'],
    ['isBot', 'isBot'], ['emailVerified', 'emailVerified'], ['googleLinked', 'googleLinked'], ['avatarUrl', 'avatarUrl'],
    ['kycStatus', 'kycStatus'], ['hasPassword', 'hasPassword'],
    ['twoFactorEnabled', 'twoFactor.enabled'], ['twoFactorEnabledAt', 'twoFactor.enabledAt', 'date'],
    ['preferences.theme', 'preferences.theme'], ['preferences.hideSmallBalances', 'preferences.hideSmallBalances'],
    ['watchlist', 'watchlist', 'list'],
    ['failedLoginCount', 'failedLoginCount'], ['lockUntil', 'lockUntil', 'date'], ['lastLoginAt', 'lastLoginAt', 'date'], ['createdAt', 'createdAt', 'date'],
  ],
  sessions: [
    ['id', '_id', 'id'], ['userId', 'userId', 'id'], ['device', 'device'], ['userAgent', 'userAgent'], ['ip', 'ip'],
    ['tokenVersion', 'tokenVersion'], ['rotatedAt', 'rotatedAt', 'date'], ['createdAt', 'createdAt', 'date'],
    ['lastUsedAt', 'lastUsedAt', 'date'], ['expiresAt', 'expiresAt', 'date'], ['revokedAt', 'revokedAt', 'date'],
  ],
  balances: [
    ['userId', 'userId', 'id'], ['asset', 'asset'], ['available', 'available', 'amount'], ['locked', 'locked', 'amount'],
  ],
  ledger: [
    ['id', '_id', 'id'], ['userId', 'userId', 'id'], ['asset', 'asset'], ['type', 'type'],
    ['deltaAvailable', 'deltaAvailable', 'amount'], ['deltaLocked', 'deltaLocked', 'amount'],
    ['availableAfter', 'availableAfter', 'amount'], ['lockedAfter', 'lockedAfter', 'amount'],
    ['refType', 'refType'], ['refId', 'refId', 'id'], ['note', 'note'], ['time', 'time', 'date'],
  ],
  orders: [
    ['id', '_id', 'id'], ['userId', 'userId', 'id'], ['market', 'market'], ['side', 'side'], ['type', 'type'], ['timeInForce', 'timeInForce'],
    ['price', 'price', 'amount'], ['quantity', 'quantity', 'amount'], ['quoteQuantity', 'quoteQuantity', 'amount'],
    ['filledQuantity', 'filledQuantity', 'amount'], ['executedQuote', 'executedQuote', 'amount'], ['avgPrice', 'avgPrice', 'amount'],
    ['fee', 'fee', 'amount'], ['feeAsset', 'feeAsset'], ['status', 'status'], ['cancelReason', 'cancelReason'], ['rejectReason', 'rejectReason'],
    ['cancelRequestedAt', 'cancelRequestedAt', 'date'], ['clientOrderId', 'clientOrderId'],
    ['createdAt', 'createdAt', 'date'], ['updatedAt', 'updatedAt', 'date'], ['appliedAt', 'appliedAt', 'date'],
  ],
  fills: [
    ['id', 'tradeId', 'id'], ['orderId', 'orderId', 'id'], ['userId', 'userId', 'id'], ['market', 'market'], ['side', 'side'], ['role', 'role'],
    ['price', 'price', 'amount'], ['quantity', 'quantity', 'amount'], ['quoteQuantity', 'quoteQuantity', 'amount'],
    ['fee', 'fee', 'amount'], ['feeAsset', 'feeAsset'], ['time', 'time', 'date'],
  ],
};

const read = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);

function write(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = object;
  for (const key of keys) target = target[key] ??= {};
  target[last] = value;
}

const convert = (type, way, value) => (value == null || !type ? value : CONVERT[type][way](value));

/** A record's values by document path, converted: { 'twoFactor.enabled': true, … }. Unset fields are left out. */
export function toPaths(collection, record) {
  const paths = {};
  for (const [field, path, type] of FIELDS[collection]) {
    const value = read(record, field);
    if (value !== undefined) paths[path] = convert(type, 'to', value);
  }
  return paths;
}

/** A record as a nested document, for insertMany and validation. */
export function toDocument(collection, record) {
  const doc = {};
  for (const [path, value] of Object.entries(toPaths(collection, record))) write(doc, path, value);
  return doc;
}

/** A document (a plain object from lean(), or a Mongoose document) as a record. */
export function toRecord(collection, doc) {
  const source = doc.toObject ? doc.toObject({ getters: false, virtuals: false }) : doc;
  const record = {};
  for (const [field, path, type] of FIELDS[collection]) write(record, field, convert(type, 'from', read(source, path)) ?? null);
  if (collection === 'balances') {
    record.total = money.fixed(money.add(record.available, record.locked), writtenDecimals(record.available));
  }
  return record;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** What to $set for a record: the paths whose values differ from its last copy, or all of them when there is none. */
export function changedPaths(collection, record, last) {
  const paths = {};
  for (const [field, path, type] of FIELDS[collection]) {
    if (KEYS[collection].includes(field)) continue; // the filter fixes these
    const value = read(record, field);
    if (value === undefined || (last && same(value, read(last, field)))) continue;
    paths[path] = convert(type, 'to', value);
  }
  return paths;
}

/** The stored fields (top-level names, such as `preferences`) in which two records differ. */
export const fieldsThatDiffer = (collection, a, b) => [...new Set(FIELDS[collection].map(([field]) => field.split('.')[0]))]
  .filter((field) => !same(a[field], b[field]));

/** One string per record, the same before and after a save. */
export const keyOf = (collection, record) => KEYS[collection].map((field) => record[field]).join('|');

/** The query that finds a record's document, and the document paths it already fixes. */
export function filterOf(collection, record) {
  const rows = FIELDS[collection].filter(([field]) => KEYS[collection].includes(field));
  return Object.fromEntries(rows.map(([field, path, type]) => [path, convert(type, 'to', record[field])]));
}
