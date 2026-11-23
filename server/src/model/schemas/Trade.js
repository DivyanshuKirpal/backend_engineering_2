// trades: one document per side of a fill, linked by tradeId. Section 3 has one
// per match with both orders in it, but most fills here meet the bot's
// anonymous ladder, which has no order document to point at.

import mongoose from 'mongoose';
import { aboveZero, amount, notNegative, ref, withGetters } from './fields.js';

const { Schema } = mongoose;

const tradeSchema = new Schema({
  tradeId: { type: Schema.Types.ObjectId, required: true }, // the same on both sides of one fill
  orderId: ref('Order', { required: true }),
  userId: ref('User', { required: true }), // copied from the order, so a user's trades need no join
  market: { type: String, required: true, match: /^[A-Z]+-[A-Z]+$/ },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  role: { type: String, enum: ['maker', 'taker'], required: true },
  price: amount({ required: true, validate: aboveZero }), // always the resting order's price
  quantity: amount({ required: true, validate: aboveZero }),
  quoteQuantity: amount({ required: true, validate: notNegative }),
  fee: amount({ required: true, validate: notNegative }), // the fee charged then: the rate can change later
  feeAsset: { type: String, required: true },
  time: { type: Date, required: true },
}, { collection: 'trades', ...withGetters });

tradeSchema.index({ userId: 1, time: -1 }); // my trades, newest first
tradeSchema.index({ orderId: 1 }); // an order's fills (Order.fills)
tradeSchema.index({ tradeId: 1, orderId: 1 }, { unique: true });

export const Trade = mongoose.model('Trade', tradeSchema);
