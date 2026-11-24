// The order and trade reads, as Mongoose queries on the compound indexes.
// Placing and cancelling stay in the engine. Every query names the user, so
// nobody reads another user's rows. The handlers flush the store first, so a
// list is never older than the engine's last change.
//
// lean() returns plain objects: these rows are only shown, never saved.

import { after, decodeCursor, page } from '../../lib/cursor.js';
import { notFound } from '../../lib/errors.js';
import { toRecord } from '../documents.js';
import { LedgerEntry } from '../schemas/LedgerEntry.js';
import { CLOSED_STATUSES, OPEN_STATUSES, Order } from '../schemas/Order.js';
import { Trade } from '../schemas/Trade.js';

const NEWEST = { createdAt: -1, _id: -1 };
const NEWEST_TRADE = { time: -1, _id: -1 };

const only = (filters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value));

/** The query behind GET /orders; scripts/explain.js explains the same one. */
export const listQuery = (userId, { state, market, side, cursor, limit }) => Order
  .find({ userId, status: { $in: state === 'history' ? CLOSED_STATUSES : OPEN_STATUSES }, ...only({ market, side }), ...after('createdAt', decodeCursor(cursor)) })
  .sort(NEWEST)
  .limit(limit + 1)
  .lean();

/** A page of my open orders, or of my closed ones. */
export async function list(userId, filters) {
  return page(await listQuery(userId, filters), filters.limit, 'createdAt', (doc) => toRecord('orders', doc));
}

export const tradesQuery = (userId, { market, side, cursor, limit }) => Trade
  .find({ userId, ...only({ market, side }), ...after('time', decodeCursor(cursor)) })
  .sort(NEWEST_TRADE)
  .limit(limit + 1)
  .lean();

/** A page of my trades. */
export async function trades(userId, filters) {
  return page(await tradesQuery(userId, filters), filters.limit, 'time', (doc) => toRecord('fills', doc));
}

/** The ledger entries an order and its trades wrote, in the order they were written. */
export const ledgerQuery = (userId, orderId, tradeIds) => LedgerEntry
  .find({ userId, $or: [{ refType: 'order', refId: orderId }, { refType: 'trade', refId: { $in: tradeIds } }] })
  .sort({ time: 1, _id: 1 })
  .lean();

/**
 * One of my orders with its fills and ledger entries. populate() fills in the
 * virtual `fills` with a second query, Trade.find({ orderId: { $in: [id] } }).
 * An id that isn't one, and another user's order, are both simply not found.
 */
export async function detail(userId, id) {
  const order = /^[0-9a-f]{24}$/i.test(id) ? await Order.findOne({ _id: id, userId }).populate('fills').lean() : null;
  if (!order) throw notFound('That order doesn\'t exist.');
  const ledger = await ledgerQuery(userId, order._id, order.fills.map((fill) => fill.tradeId));
  return {
    order: toRecord('orders', order),
    fills: order.fills.map((fill) => toRecord('fills', fill)),
    ledger: ledger.map((entry) => toRecord('ledger', entry)),
  };
}
