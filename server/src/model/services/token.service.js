// The two tokens of section 4, both JWTs: a payload anyone can read, with a
// signature only the server can make. Nothing secret goes into a payload.
//
//   access   { sub: user id, role, sid: session id }  15 minutes, in the page's memory
//   refresh  { sid, ver }                             7 days, in the httpOnly rt cookie
//
// They are signed with different secrets, so one can't pass for the other.
//
// The refresh token is rotated: every use makes a new one and raises the
// session's tokenVersion, so an old token stops working. If an old one turns up
// anyway, somebody kept a copy: the session is ended, for the thief and the
// owner alike. One case isn't theft: two tabs refreshing at the same moment
// send the same token. So for 30 seconds after a rotation, the token one
// version behind gets the current one.

import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { durationMs } from '../../lib/util.js';
import { Session } from '../schemas/Session.js';

const ALGORITHM = 'HS256';
const GRACE_MS = 30 * 1000;

export const signAccess = (user, session) => jwt.sign(
  { role: user.role, sid: session.id },
  env.JWT_ACCESS_SECRET,
  { subject: user.id, algorithm: ALGORITHM, expiresIn: env.ACCESS_TOKEN_TTL },
);

export const signRefresh = (session) => jwt.sign(
  { sid: session.id, ver: session.tokenVersion },
  env.JWT_REFRESH_SECRET,
  { algorithm: ALGORITHM, expiresIn: env.REFRESH_TOKEN_TTL },
);

/** A token's payload, or null when it is missing, changed, expired or signed some other way. */
function read(token, secret) {
  try {
    // The algorithm is fixed here: a token can't choose its own, such as "none"
    return jwt.verify(token, secret, { algorithms: [ALGORITHM] });
  } catch {
    return null;
  }
}

export const readAccess = (token) => read(token, env.JWT_ACCESS_SECRET);
export const readRefresh = (token) => read(token, env.JWT_REFRESH_SECRET);

/** When a session that is used now expires: one refresh lifetime from now. */
export const sessionExpiry = () => new Date(Date.now() + durationMs(env.REFRESH_TOKEN_TTL));

/**
 * Uses a refresh token: { session } with the session document to sign the next
 * tokens for, or { session: null }, with `reused` true when the token was an old one.
 */
export async function rotate({ sid, ver }) {
  const now = new Date();
  // One conditional update: only the request that finds the version it expects
  // rotates, so two arriving together can't both do it.
  const rotated = await Session.findOneAndUpdate(
    { _id: sid, tokenVersion: ver, revokedAt: null, expiresAt: { $gt: now } },
    { $inc: { tokenVersion: 1 }, $set: { rotatedAt: now, lastUsedAt: now, expiresAt: sessionExpiry() } },
    { returnDocument: 'after' },
  );
  if (rotated) return { session: rotated };

  const current = await Session.findById(sid);
  if (!current || current.revokedAt || current.expiresAt <= now) return { session: null };
  const justRotated = current.rotatedAt && now - current.rotatedAt <= GRACE_MS;
  if (ver === current.tokenVersion - 1 && justRotated) return { session: current };
  return { session: null, reused: current };
}
