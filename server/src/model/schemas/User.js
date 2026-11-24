// users (section 3). The email is the login identity, so it is unique. Three
// things are embedded, because they are small, bounded and always read with
// the user: preferences, two-factor settings and the watchlist. The two hashes
// are `select: false`: a query leaves them out unless it asks for them.
//
// A plain password is never stored. Setting `user.password` keeps it on the
// document for one save, and the pre-save hook below turns it into a hash.

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { conflict } from '../../lib/errors.js';
import { withGetters } from './fields.js';

const { Schema } = mongoose;

const userSchema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true, match: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address.'] },
  passwordHash: { type: String, select: false }, // bcrypt; absent on accounts that can't sign in with a password
  hasPassword: { type: Boolean, default: true },
  displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  role: { type: String, enum: ['user', 'admin'], required: true, default: 'user' },
  status: { type: String, enum: ['active', 'frozen'], required: true, default: 'active' },
  isBot: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  googleLinked: { type: Boolean, default: false },
  avatarUrl: { type: String, default: null },
  kycStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], required: true, default: 'none' },
  twoFactor: {
    enabled: { type: Boolean, default: false },
    enabledAt: { type: Date, default: null },
    codeHash: { type: String, select: false }, // the demo's fixed code, hashed like a password; TOTP comes later
  },
  preferences: {
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    hideSmallBalances: { type: Boolean, default: false },
  },
  watchlist: {
    type: [String],
    default: [],
    validate: { validator: (list) => list.length <= 50, message: 'A watchlist holds at most 50 markets' },
  },
  failedLoginCount: { type: Number, min: 0, default: 0 },
  lockUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  createdAt: { type: Date, required: true, default: Date.now },
}, { collection: 'users', ...withGetters });

userSchema.index({ email: 1 }, { unique: true });

/** The plain password: held in $locals, which isn't saved, until the next save hashes it. */
userSchema.virtual('password').set(function setPassword(plain) {
  this.$locals.password = String(plain);
});

// Mongoose middleware: runs inside every save(), after validation and before the write
userSchema.pre('save', async function hashPassword() {
  if (this.$locals.password === undefined) return;
  this.passwordHash = await bcrypt.hash(this.$locals.password, env.BCRYPT_ROUNDS);
  this.hasPassword = true;
  delete this.$locals.password;
});

// Error-handling middleware: the unique index refused the email (E11000), which the API answers as a 409
userSchema.post('save', function duplicateEmail(err, doc, next) {
  next(err.code === 11000 && err.keyPattern?.email ? conflict('An account with this email already exists.', { email: 'taken' }) : err);
});

/** Whether this is the password. The document must be loaded with +passwordHash. */
userSchema.method('comparePassword', async function comparePassword(plain) {
  return Boolean(this.passwordHash) && bcrypt.compare(String(plain ?? ''), this.passwordHash);
});

/** Whether this is the 2FA code. The document must be loaded with +twoFactor.codeHash. */
userSchema.method('compareCode', async function compareCode(code) {
  return Boolean(this.twoFactor.codeHash) && bcrypt.compare(String(code ?? ''), this.twoFactor.codeHash);
});

/** True while too many wrong passwords keep sign-in paused. */
userSchema.virtual('isLocked').get(function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil > new Date());
});

/** The user with this email, whatever its case or spacing. */
userSchema.static('findByEmail', function findByEmail(email) {
  return this.findOne({ email: String(email ?? '').trim().toLowerCase() });
});

export const User = mongoose.model('User', userSchema);
