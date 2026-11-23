// orders (section 3). Which amounts an order needs depends on its type: a limit
// order has a price and a quantity, a market sell a quantity, a market buy the
// quote amount to spend.

import mongoose from 'mongoose';
import * as money from '../../../../client/src/models/domain/money.js';
import { fromDecimal, writtenDecimals } from '../../lib/decimal.js';
import { aboveZero, amount, notNegative, ref, withGetters } from './fields.js';

const { Schema } = mongoose;

export const OPEN_STATUSES = ['pending', 'open', 'partially_filled'];
const STATUSES = [...OPEN_STATUSES, 'filled', 'cancelled', 'rejected'];
const CANCEL_REASONS = ['user', 'ioc_remainder', 'self_trade', 'market_halted', 'account_frozen'];

const isMarketBuy = (order) => order.type === 'market' && order.side === 'buy';

const orderSchema = new Schema({
  userId: ref('User', { required: true }),
  market: { type: String, required: true, match: /^[A-Z]+-[A-Z]+$/ },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  type: { type: String, enum: ['limit', 'market'], required: true },
  timeInForce: { type: String, enum: ['GTC', 'IOC'], required: true },
  price: amount({ default: null, required() { return this.type === 'limit'; }, validate: aboveZero }),
  quantity: amount({ default: null, required() { return !isMarketBuy(this); }, validate: aboveZero }),
  quoteQuantity: amount({ default: null, required() { return isMarketBuy(this); }, validate: aboveZero }),
  filledQuantity: amount({
    required: true,
    default: '0',
    validate: [
      notNegative,
      {
        // `this` is the order being saved; its quantity reads as a string (the getter).
        // A quantity that isn't positive has its own error, so it isn't reported twice.
        validator(value) {
          return this.quantity == null || !money.isPositive(this.quantity) || money.lte(fromDecimal(value), this.quantity);
        },
        message: 'filledQuantity can\'t be above quantity',
      },
    ],
  }),
  executedQuote: amount({ required: true, default: '0', validate: notNegative }),
  avgPrice: amount({ default: null, validate: aboveZero }),
  fee: amount({ required: true, default: '0', validate: notNegative }),
  feeAsset: { type: String, required: true },
  status: { type: String, enum: STATUSES, required: true, default: 'pending' },
  cancelReason: { type: String, enum: [...CANCEL_REASONS, null], default: null },
  rejectReason: { type: String, default: null },
  cancelRequestedAt: { type: Date, default: null },
  clientOrderId: { type: String, required: true }, // the request's Idempotency-Key, or one the server made
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
  appliedAt: { type: Date, default: null }, // when the engine applied it
}, { collection: 'orders', ...withGetters });

orderSchema.index({ userId: 1, status: 1, createdAt: -1 }); // my open orders and my history, newest first
orderSchema.index({ market: 1, status: 1, createdAt: 1 }); // a market's open orders, oldest first, to rebuild its book
orderSchema.index({ userId: 1, clientOrderId: 1 }, { unique: true }); // a retried request can't make a second order

/** What is left to fill; null for a market buy, which is bounded by what it may spend. */
orderSchema.virtual('remainingQuantity').get(function remainingQuantity() {
  if (this.quantity == null) return null;
  return money.fixed(money.sub(this.quantity, this.filledQuantity), writtenDecimals(this.quantity));
});

orderSchema.virtual('isOpen').get(function isOpen() {
  return OPEN_STATUSES.includes(this.status);
});

/** The order's fills, found through Trade.orderId; an order document stores no list of them. */
orderSchema.virtual('fills', { ref: 'Trade', localField: '_id', foreignField: 'orderId', options: { sort: { time: 1, _id: 1 } } });

/** A user's open orders, oldest first, on one market or on all of them. */
orderSchema.static('findOpen', function findOpen(userId, market) {
  return this.find({ userId, status: { $in: OPEN_STATUSES }, ...(market ? { market } : {}) }).sort({ createdAt: 1, _id: 1 });
});

export const Order = mongoose.model('Order', orderSchema);
