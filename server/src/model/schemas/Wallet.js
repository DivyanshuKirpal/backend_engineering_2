// wallets (section 3): one document per user and asset. Never a float: both
// amounts are Decimal128, and neither can be negative.

import mongoose from 'mongoose';
import * as money from '../../../../client/src/models/domain/money.js';
import { writtenDecimals } from '../../lib/decimal.js';
import { amount, notNegative, ref, withGetters } from './fields.js';

const { Schema } = mongoose;

const walletSchema = new Schema({
  userId: ref('User', { required: true }),
  asset: { type: String, required: true, uppercase: true },
  available: amount({ required: true, default: '0', validate: notNegative }), // free to trade or withdraw
  locked: amount({ required: true, default: '0', validate: notNegative }), // held by open orders and pending withdrawals
}, { collection: 'wallets', ...withGetters });

walletSchema.index({ userId: 1, asset: 1 }, { unique: true });

/** available + locked, worked out when asked for, so it can't disagree with them. */
walletSchema.virtual('total').get(function total() {
  return money.fixed(money.add(this.available, this.locked), writtenDecimals(this.available));
});

export const Wallet = mongoose.model('Wallet', walletSchema);
