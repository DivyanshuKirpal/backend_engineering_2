// ledgerEntries (section 3): an append-only record of every balance change.
// Adding up a user's entries for an asset must give their wallet, which is
// what scripts/check-ledger.js proves.

import mongoose from 'mongoose';
import { fromDecimal } from '../../lib/decimal.js';
import { amount, notNegative, ref, withGetters } from './fields.js';

const { Schema } = mongoose;

const TYPES = [
  'demo_credit', 'deposit', 'withdrawal_lock', 'withdrawal', 'withdrawal_fee', 'withdrawal_unlock',
  'order_lock', 'order_unlock', 'trade_debit', 'trade_credit', 'trade_fee',
];

const ledgerSchema = new Schema({
  userId: ref('User', { required: true }),
  asset: { type: String, required: true, uppercase: true },
  type: { type: String, enum: TYPES, required: true },
  deltaAvailable: amount({ required: true }), // signed
  deltaLocked: amount({ required: true }), // signed
  availableAfter: amount({ required: true, validate: notNegative }),
  lockedAfter: amount({ required: true, validate: notNegative }),
  refType: { type: String, enum: ['order', 'trade', 'transaction', 'system'], required: true },
  refId: { type: Schema.Types.ObjectId, default: null }, // an order, a trade or a transaction, as refType says
  note: { type: String, default: null },
  time: { type: Date, required: true },
}, { collection: 'ledgerEntries', ...withGetters });

ledgerSchema.index({ userId: 1, asset: 1, time: -1 }); // one user's history of an asset, newest first
ledgerSchema.index({ refType: 1, refId: 1 }); // the entries an order or a trade wrote

/**
 * A user's balance of one asset, added up from the ledger by MongoDB. An
 * aggregation doesn't cast its values the way a query does, so the id is
 * turned into an ObjectId here.
 */
ledgerSchema.static('balanceFor', async function balanceFor(userId, asset) {
  const [sums] = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)), asset } },
    { $group: { _id: null, available: { $sum: '$deltaAvailable' }, locked: { $sum: '$deltaLocked' } } },
  ]);
  return { available: fromDecimal(sums?.available) ?? '0', locked: fromDecimal(sums?.locked) ?? '0' };
});

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerSchema);
