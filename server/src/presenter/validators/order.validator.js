// What placing an order and listing orders or trades may send. These rules are
// about the request's shape; the market's own rules (tick, step, smallest order,
// balance) stay in the engine, which answers 422.

import { z } from 'zod';
import { rule } from '../../lib/validation.js';
import { db } from '../../model/store.js';
import { amount, cursor, limit, marketSymbol, oneOf, side, text } from './rules.js';

const isListed = (symbol) => db().markets.some((market) => market.symbol === symbol && market.status !== 'delisted');

/** Which amounts an order needs depends on its type and side. */
const needs = {
  price: (order) => order.type === 'limit',
  quantity: (order) => order.type === 'limit' || (order.type === 'market' && order.side === 'sell'),
  quoteQuantity: (order) => order.type === 'market' && order.side === 'buy', // a market buy says how much to spend
};

const required = (field, name) => [
  (order) => !needs[field](order) || order[field] != null,
  {
    path: [field],
    message: rule('required', `Enter the ${name}.`),
    // Checked even when another field has failed already, so one answer names every field
    when: ({ value }) => value !== null && typeof value === 'object',
  },
];

export const place = z.object({
  market: text('Choose a market.', { max: 21 }).refine(isListed, rule('unknown', 'That market doesn\'t exist.')),
  side,
  type: oneOf(['limit', 'market'], 'Type is limit or market.'),
  timeInForce: oneOf(['GTC', 'IOC'], 'Time in force is GTC or IOC.').optional(),
  price: amount('price').nullish(),
  quantity: amount('amount').nullish(),
  quoteQuantity: amount('total').nullish(),
})
  .refine(...required('price', 'price'))
  .refine(...required('quantity', 'amount'))
  .refine(...required('quoteQuantity', 'total'));

export const list = z.object({
  state: oneOf(['open', 'history'], 'State is open or history.').optional(),
  market: marketSymbol.optional(),
  side: side.optional(),
  cursor,
  limit,
});

export const trades = list.omit({ state: true });

export const cancelAll = z.object({ market: marketSymbol.optional() });
