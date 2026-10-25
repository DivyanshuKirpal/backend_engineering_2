// Order rules (section 6): tick, step, minimum and balance checks, what an order
// locks, the most its fee can be, the 25-100% amounts, and what the engine will
// do with it given the current book. Every value is a decimal string. Results
// are codes and raw values; presenters turn them into sentences.

import * as money from './money.js';

/** `{ asset, amount }` an order locks when the API accepts it. */
export function lockFor(market, order) {
  if (order.side === 'sell') return { asset: market.baseAsset, amount: order.quantity };
  if (order.type === 'market') return { asset: market.quoteAsset, amount: order.quoteQuantity };
  return { asset: market.quoteAsset, amount: money.mul(order.price, order.quantity) };
}

/** What an open order still holds: the unfilled quantity or its quote. */
export function stillLocked(market, order) {
  if (order.side === 'sell') {
    return { asset: market.baseAsset, amount: money.sub(order.quantity, order.filledQuantity) };
  }
  if (order.type === 'market') {
    return { asset: market.quoteAsset, amount: money.sub(order.quoteQuantity, order.executedQuote) };
  }
  return { asset: market.quoteAsset, amount: money.mul(order.price, money.sub(order.quantity, order.filledQuantity)) };
}

/** The most the fee can be: the taker rate, in the asset received, rounded up. */
export function feeAtMost(market, order, decimals) {
  if (order.side === 'buy') {
    const qty = order.type === 'market' ? null : order.quantity;
    if (!qty || !money.isDecimal(qty)) return null;
    return { asset: market.baseAsset, amount: money.round(money.mul(qty, market.takerFeeRate, 'up'), decimals.base, 'ceil') };
  }
  const total = order.type === 'market' ? null : orderTotal(order);
  if (!total) return null;
  return { asset: market.quoteAsset, amount: money.round(money.mul(total, market.takerFeeRate, 'up'), decimals.quote, 'ceil') };
}

export function orderTotal(order) {
  if (!money.isDecimal(order.price ?? '') || !money.isDecimal(order.quantity ?? '')) return null;
  return money.mul(order.price, order.quantity);
}

/**
 * Checks an order before it is sent. `free` holds the available balances by
 * asset. Returns `{ ok, errors }`, errors keyed by field: price, quantity,
 * total (a market buy's spend) or form, each `{ code, ...values }`.
 */
export function validate(market, order, free) {
  const errors = {};
  const positive = (v) => money.isDecimal(v ?? '') && money.isPositive(v);

  if (market.status !== 'active') errors.form = { code: 'halted' };

  if (order.type === 'limit') {
    if (!positive(order.price)) errors.price = { code: 'required' };
    else if (!money.fitsStep(order.price, market.tickSize)) {
      errors.price = { code: 'tick', step: market.tickSize, suggestion: money.roundToStep(order.price, market.tickSize, 'halfUp') };
    }
  }

  if (order.type === 'limit' || order.side === 'sell') {
    if (!positive(order.quantity)) errors.quantity = { code: 'required' };
    else if (!money.fitsStep(order.quantity, market.stepSize)) {
      errors.quantity = { code: 'step', step: market.stepSize, suggestion: money.roundToStep(order.quantity, market.stepSize, 'down') };
    } else if (money.lt(order.quantity, market.minQty)) errors.quantity = { code: 'minQty', min: market.minQty };
  } else if (!positive(order.quoteQuantity)) {
    errors.total = { code: 'required' };
  }

  if (errors.price || errors.quantity || errors.total) return { ok: false, errors };

  const notional = order.type === 'market' && order.side === 'buy' ? order.quoteQuantity : order.type === 'limit' ? orderTotal(order) : null;
  if (notional && money.lt(notional, market.minNotional)) {
    errors[order.type === 'market' ? 'total' : 'form'] = { code: 'minNotional', min: market.minNotional, market: market.symbol };
  }

  const lock = lockFor(market, order);
  const have = free?.[lock.asset] ?? '0';
  if (!errors.form && money.gt(lock.amount, have)) {
    errors.form = { code: 'balance', asset: lock.asset, need: lock.amount, free: have };
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** The amount for one of the 25/50/75/100% buttons, rounded down to the step. */
export function amountForShare(market, { side, type, price }, free, share) {
  const pct = money.div(String(share), '100', 4);
  if (side === 'sell') {
    return { quantity: money.roundToStep(money.mul(free[market.baseAsset] ?? '0', pct), market.stepSize, 'down') };
  }
  const spend = money.mul(free[market.quoteAsset] ?? '0', pct);
  if (type === 'market') return { quoteQuantity: money.round(spend, 2, 'down') };
  if (!money.isDecimal(price ?? '') || !money.isPositive(price)) return { quantity: null };
  return { quantity: money.roundToStep(money.div(spend, price, 18, 'down'), market.stepSize, 'down') };
}

/**
 * What the engine will do with this order against `book` ({ bids, asks } of
 * [price, quantity] strings, best first). One of:
 *   { kind: 'rest', place: 'newBest' }                        first in a new best price
 *   { kind: 'rest', place: 'join', ahead }                    behind `ahead` at the best price
 *   { kind: 'rest', place: 'behind', levelsAbove, ahead }     deeper in the book
 *   { kind: 'take', filled, avgPrice, levels, rest }          fills now as a taker; `rest` stays (limit) or is cancelled (market)
 *   { kind: 'none' }                                          nothing to match yet
 */
export function engineWillDo(market, order, book) {
  const buying = order.side === 'buy';
  const opposite = buying ? book.asks : book.bids;
  const same = buying ? book.bids : book.asks;
  const crosses = (p) => (order.type === 'market' ? true : buying ? money.lte(p, order.price) : money.gte(p, order.price));

  let wanted = order.type === 'market' && buying ? null : order.quantity;
  let budget = order.type === 'market' && buying ? order.quoteQuantity : null;
  if ((wanted && !money.isDecimal(wanted)) || (budget && !money.isDecimal(budget))) return { kind: 'none' };

  let filled = '0';
  let spent = '0';
  let levels = 0;
  for (const [p, q] of opposite) {
    if (!crosses(p)) break;
    let n = q;
    if (wanted != null) n = money.min(n, money.sub(wanted, filled));
    if (budget != null) n = money.min(n, money.roundToStep(money.div(money.sub(budget, spent), p, 18, 'down'), market.stepSize, 'down'));
    if (!money.isPositive(n)) break;
    filled = money.add(filled, n);
    spent = money.add(spent, money.mul(p, n));
    levels += 1;
    if (wanted != null && money.gte(filled, wanted)) break;
  }

  if (money.isPositive(filled)) {
    const rest = wanted != null ? money.sub(wanted, filled) : null;
    return { kind: 'take', filled, avgPrice: money.div(spent, filled, 8), levels, rest, spent };
  }
  if (order.type === 'market') return { kind: 'none' };

  const better = (p) => (buying ? money.gt(order.price, p) : money.lt(order.price, p));
  const top = same[0];
  if (!top || better(top[0])) return { kind: 'rest', place: 'newBest' };
  if (money.eq(top[0], order.price)) return { kind: 'rest', place: 'join', ahead: top[1] };
  const above = same.filter(([p]) => better(p) === false && !money.eq(p, order.price)).length;
  const level = same.find(([p]) => money.eq(p, order.price));
  return { kind: 'rest', place: 'behind', levelsAbove: above, ahead: level ? level[1] : '0' };
}
