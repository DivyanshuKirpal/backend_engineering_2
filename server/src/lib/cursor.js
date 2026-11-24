// Keyset cursors for "load more" lists, newest first. A page's cursor holds the
// sort key of its last row (its time and its id), and the next page asks for the
// rows after that key. An offset ("skip 20") counts from the top instead: a new
// row pushes everything down and one row shows twice, and MongoDB still walks
// every row it skips. To the client a cursor is opaque text.

import { badRequest } from './errors.js';

const encode = (time, id) => Buffer.from(JSON.stringify([time.toISOString(), id.toString()])).toString('base64url');

/** A cursor's { time, id }, or null for the first page; anything else is a 400. */
export function decodeCursor(text) {
  if (text == null || text === '') return null;
  try {
    const [time, id] = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8'));
    const date = new Date(time);
    if (Number.isNaN(date.getTime()) || !/^[0-9a-f]{24}$/.test(id)) throw new Error('not a cursor');
    return { time: date, id };
  } catch {
    throw badRequest('That page isn\'t valid any more. Load the list again.', { cursor: 'format' });
  }
}

/** The filter for the rows after a cursor, in { [field]: -1, _id: -1 } order. */
export const after = (field, cursor) => (cursor
  ? { [field]: { $lte: cursor.time }, $or: [{ [field]: { $lt: cursor.time } }, { _id: { $lt: cursor.id } }] }
  : {});

/** A page from limit + 1 documents: the extra one only tells that there is a next page. */
export function page(docs, limit, field, map) {
  const items = docs.slice(0, limit);
  const last = items[items.length - 1];
  return { items: items.map(map), nextCursor: docs.length > limit ? encode(last[field], last._id) : null };
}
