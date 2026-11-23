// sessions (section 3): one document per signed-in device, referenced from the
// user rather than embedded, because they come and go on their own. The TTL
// index makes MongoDB delete a session by itself once expiresAt has passed.

import mongoose from 'mongoose';
import { ref, withGetters } from './fields.js';

const { Schema } = mongoose;

const sessionSchema = new Schema({
  userId: ref('User', { required: true }),
  device: { type: String, required: true }, // "Chrome 130 on macOS"
  userAgent: { type: String, default: null },
  ip: { type: String, default: null },
  tokenVersion: { type: Number, required: true, default: 0 }, // goes up on every refresh rotation (M6)
  rotatedAt: { type: Date, default: null },
  createdAt: { type: Date, required: true, default: Date.now },
  lastUsedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { collection: 'sessions', ...withGetters });

sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
