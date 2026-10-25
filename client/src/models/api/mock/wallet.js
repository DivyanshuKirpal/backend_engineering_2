// The mock server's wallet.service (section 1): the only code that changes a
// balance. Every change writes one ledger entry with the balances after it and
// pushes balance.update to the owner's room. Bot accounts keep no ledger here.

import * as money from '../../domain/money.js';
import { db, newId, persist } from './db.js';
import { publish } from './bus.js';
import { MockError } from './errors.js';

const decimals = (asset) => db().assets.find((a) => a.code === asset)?.decimals ?? 8;
const isBot = (userId) => db().users.find((u) => u.id === userId)?.isBot ?? true;

/** The Balance DTO for one asset; zero when the wallet doesn't exist yet. */
export function balance(userId, asset) {
  const w = db().balances.find((b) => b.userId === userId && b.asset === asset);
  const d = decimals(asset);
  if (!w) return { asset, available: money.fixed('0', d), locked: money.fixed('0', d), total: money.fixed('0', d) };
  return { asset, available: w.available, locked: w.locked, total: w.total };
}

export function balances(userId) {
  return db().assets.filter((a) => a.status === 'active').map((a) => balance(userId, a.code));
}

function write(userId, asset, type, dAvailable, dLocked, ref = {}) {
  if (isBot(userId)) return null;
  const d = decimals(asset);
  let w = db().balances.find((b) => b.userId === userId && b.asset === asset);
  if (!w) {
    w = { userId, asset, available: money.fixed('0', d), locked: money.fixed('0', d), total: money.fixed('0', d) };
    db().balances.push(w);
  }
  const available = money.add(w.available, dAvailable);
  const locked = money.add(w.locked, dLocked);
  if (money.isNegative(available) || money.isNegative(locked)) {
    throw new MockError(422, 'INSUFFICIENT_BALANCE', `Not enough ${asset} available.`, { asset, available: w.available });
  }
  w.available = money.fixed(available, d);
  w.locked = money.fixed(locked, d);
  w.total = money.fixed(money.add(available, locked), d);
  const entry = {
    id: newId(),
    userId, asset, type,
    deltaAvailable: money.fixed(dAvailable, d),
    deltaLocked: money.fixed(dLocked, d),
    availableAfter: w.available,
    lockedAfter: w.locked,
    refType: ref.refType ?? 'system',
    refId: ref.refId ?? null,
    note: ref.note ?? null,
    time: ref.time ?? new Date().toISOString(),
  };
  db().ledger.push(entry);
  persist();
  publish(`user:${userId}`, 'balance.update', balance(userId, asset));
  return entry;
}

export const credit = (userId, asset, amount, type, ref) => write(userId, asset, type, amount, '0', ref);
export const debit = (userId, asset, amount, type, ref) => write(userId, asset, type, money.neg(amount), '0', ref);
export const lock = (userId, asset, amount, type, ref) => write(userId, asset, type, money.neg(amount), amount, ref);
export const unlock = (userId, asset, amount, type, ref) => write(userId, asset, type, amount, money.neg(amount), ref);
export const debitLocked = (userId, asset, amount, type, ref) => write(userId, asset, type, '0', money.neg(amount), ref);

export const decimalsOf = decimals;
