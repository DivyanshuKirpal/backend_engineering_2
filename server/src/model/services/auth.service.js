// Sign-in, on the user documents in MongoDB. Passwords and the 2FA code exist
// only as bcrypt hashes: a hash can't be turned back, so a guess is hashed the
// same way and compared. These functions read and write MongoDB directly, then
// tell the store's working set through remember().

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { ApiError, unauthenticated } from '../../lib/errors.js';
import { toRecord } from '../documents.js';
import { audit } from '../exchange/session.js';
import { User } from '../schemas/User.js';
import { db, persist, remember } from '../store.js';

const LOCK_AFTER = 5; // wrong passwords in a row
const LOCK_MINUTES = 15;

/** The demo's fixed 2FA code; TOTP comes later. Stored like a password, as a hash. */
export const DEMO_CODE = '123456';

const refused = () => unauthenticated('That email and password don\'t match an account.');
const locked = (until) => new ApiError(423, 'ACCOUNT_LOCKED', 'Too many wrong passwords. Sign-in is paused for 15 minutes.', { lockUntil: until.toISOString() });

/** A user document as the working set's own record. */
const taken = (doc) => remember('users', toRecord('users', doc));

// What is compared when no account has the email; see unknownEmail().
const nobody = bcrypt.hash('no account has this password', env.BCRYPT_ROUNDS);

/** bcrypt reads at most 72 bytes; a longer password would lose its end silently. */
export const tooLong = (password) => bcrypt.truncates(password);

/** Creates the account. The schema hashes the password and refuses a duplicate email with a 409. */
export async function register({ email, password, displayName }) {
  return taken(await User.create({ email, password, displayName }));
}

/** The user behind an email and password. Wrong ones are counted; five in a row lock sign-in for 15 minutes. */
export async function checkPassword(ctx, email, password) {
  const doc = await User.findByEmail(email).select('+passwordHash');
  if (doc?.isLocked) throw locked(doc.lockUntil);
  if (!doc?.passwordHash || doc.isBot) return unknownEmail(password);
  if (!(await doc.comparePassword(password))) return wrongPassword(ctx, doc);
  if (doc.failedLoginCount > 0 || doc.lockUntil) {
    doc.failedLoginCount = 0;
    doc.lockUntil = null;
    await doc.save();
  }
  return taken(doc);
}

// $inc adds in the database, so guesses sent at the same moment are all counted
const countWrong = (id) => User.findByIdAndUpdate(id, { $inc: { failedLoginCount: 1 } }, { returnDocument: 'after' });

/**
 * An email without an account, refused in the time a wrong password takes, so
 * the time doesn't tell which emails have accounts. That takes the same work: a
 * bcrypt comparison, the round trip of the count (for an id nobody has), and a
 * change to the JSON file, where a wrong password leaves its audit entry.
 */
async function unknownEmail(password) {
  await bcrypt.compare(password, await nobody);
  await countWrong(new mongoose.Types.ObjectId());
  const { meta } = db();
  meta.unknownLogins = (meta.unknownLogins ?? 0) + 1;
  persist();
  throw refused();
}

async function wrongPassword(ctx, { _id }) {
  const doc = await countWrong(_id);
  if (doc.failedLoginCount >= LOCK_AFTER) {
    doc.failedLoginCount = 0;
    doc.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    await doc.save();
  }
  audit(ctx, taken(doc), 'auth.login_failed');
  throw doc.isLocked ? locked(doc.lockUntil) : refused();
}

/** The user as MongoDB has them now, role and status included. */
export async function reload(userId) {
  const doc = await User.findById(userId).lean();
  return doc && taken(doc);
}

/** Whether this is the user's password: asked again before a change that needs it. */
export async function passwordMatches(userId, password) {
  const doc = await User.findById(userId).select('+passwordHash');
  return Boolean(doc) && doc.comparePassword(password);
}

/** A new password; the schema hashes it on save. */
export async function setPassword(userId, password) {
  const doc = await User.findById(userId);
  doc.password = password;
  await doc.save();
  return taken(doc);
}

/** Whether this is the user's 2FA code. */
export async function codeMatches(userId, code) {
  const doc = await User.findById(userId).select('+twoFactor.codeHash');
  return Boolean(doc) && doc.compareCode(code);
}

/** Switches 2FA on or off; the code's hash comes and goes with it. */
export async function setTwoFactor(userId, on) {
  const doc = await User.findById(userId).select('+twoFactor.codeHash');
  doc.twoFactor.enabled = on;
  doc.twoFactor.enabledAt = on ? new Date() : null;
  doc.twoFactor.codeHash = on ? await bcrypt.hash(DEMO_CODE, env.BCRYPT_ROUNDS) : undefined;
  await doc.save();
  return taken(doc);
}
