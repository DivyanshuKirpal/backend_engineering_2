// What the six schemas share: how a money field and a reference are declared,
// and the validators for amounts. A validator sees the raw Decimal128, so it
// compares through money.js on the decimal string, never as a float.

import mongoose from 'mongoose';
import * as money from '../../../../client/src/models/domain/money.js';
import { fromDecimal } from '../../lib/decimal.js';

const { Schema } = mongoose;

/** A Decimal128 field; reading it from a document gives a decimal string. */
export const amount = (options = {}) => ({ type: Schema.Types.Decimal128, get: fromDecimal, ...options });

/** An ObjectId reference. It must be an ObjectId, not a string: populate compares types. */
export const ref = (model, options = {}) => ({ type: Schema.Types.ObjectId, ref: model, ...options });

const optional = (test) => (value) => value == null || test(fromDecimal(value));

export const notNegative = {
  validator: optional((text) => !money.isNegative(text)),
  message: '{PATH} can\'t be negative',
};

export const aboveZero = {
  validator: optional((text) => money.isPositive(text)),
  message: '{PATH} must be above zero',
};

/** Documents turned into JSON or plain objects keep their virtuals and string amounts. */
export const withGetters = { toJSON: { virtuals: true, getters: true }, toObject: { virtuals: true, getters: true } };
