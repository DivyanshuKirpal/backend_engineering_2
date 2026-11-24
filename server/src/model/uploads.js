// Uploaded images on disk, in `uploads/` beside the JSON store (git-ignored).
// Every name is made here from ids: the file name a browser sends is never used,
// so it can't point outside the folder. Cloud storage comes later.

import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '../config/env.js';

const ROOT = join(dirname(env.STORE_FILE), 'uploads');
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Saves one image of an identity check; returns its path inside uploads/. */
export async function saveKycImage(userId, applicationId, kind, image) {
  const folder = join(ROOT, 'kyc', userId);
  await mkdir(folder, { recursive: true });
  const name = `${applicationId}-${kind}.${EXTENSIONS[image.type]}`;
  await writeFile(join(folder, name), image.buffer, { flag: 'wx' });
  return `kyc/${userId}/${name}`;
}

/**
 * An image as a stream, or null when it isn't there. A stream hands the file on
 * in small pieces as the network takes them, so the server never holds it whole.
 */
export async function openImage(path) {
  if (!path) return null;
  const file = join(ROOT, path);
  const info = await stat(file).catch(() => null);
  if (!info) return null;
  return { stream: createReadStream(file), size: info.size, type: path.endsWith('.png') ? 'image/png' : 'image/jpeg' };
}

export const removeImages = (paths) => Promise.all(paths.filter(Boolean).map((path) => rm(join(ROOT, path), { force: true })));

/** Deletes every identity image: with a reset, the applications they belong to are gone. */
export const clearImages = () => rm(join(ROOT, 'kyc'), { recursive: true, force: true });
