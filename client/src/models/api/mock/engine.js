// The mock matching engine and settlement (section 6, flows A and B). An order
// the API accepts locks its funds and waits as `pending`; a moment later the
// engine applies it: a halted market rejects it, otherwise it walks the book
// (market.take), settles every fill on both sides through the wallet, unlocks
// any price improvement, and rests the remainder or cancels a market order's
// rest. Each step pushes order.update to the owner, as the real engine does.

import * as money from '../../domain/money.js';
import * as rules from '../../domain/order.rules.js';
import { db, newId, persist } from './db.js';
import { publish } from './bus.js';
import { MockError, notFound, conflict, forbidden } from './errors.js';
import * as market from './market.js';
import * as wallet from './wallet.js';
import { grouped } from './text.js';

const OPEN = new Set(['pending', 'open', 'partially_filled']);
const APPLY_DELAY = [280, 720];
const CANCEL_DELAY = [160, 420];
const wait = ([lo, hi]) => lo + Math.random() * (hi - lo);

const marketConfig = (symbol) => db().markets.find((m) => m.symbol === symbol);
const user = (id) => db().users.find((u) => u.id === id);

export function toOrderDto(o) {
  return {
    id: o.id, market: o.market, side: o.side, type: o.type, timeInForce: o.timeInForce,
    price: o.price, quantity: o.quantity, quoteQuantity: o.quoteQuantity,
    filledQuantity: o.filledQuantity, executedQuote: o.executedQuote, avgPrice: o.avgPrice,
    fee: o.fee, feeAsset: o.feeAsset, status: o.status,
    cancelReason: o.cancelReason, rejectReason: o.rejectReason, clientOrderId: o.clientOrderId,
    createdAt: o.createdAt, updatedAt: o.updatedAt, appliedAt: o.appliedAt,
  };
}

function pushOrder(o) {
  persist();
  publish(`user:${o.userId}`, 'order.update', { order: toOrderDto(o) });
}

export function notify(userId, type, title, body, link) {
  const u = user(userId);
  if (!u || u.isBot) return;
  const n = { id: newId(), type, title, body, link, read: false, createdAt: new Date().toISOString(), userId };
  db().notifications.push(n);
  persist();
  const { userId: _, ...dto } = n;
  publish(`user:${userId}`, 'notification', { notification: dto });
}

const stepDp = (cfg) => money.decimalsOf(cfg.stepSize);
const label = (o, cfg) => `${o.side === 'buy' ? 'Buy' : 'Sell'} ${money.fixed(o.filledQuantity, stepDp(cfg))} ${cfg.baseAsset}`;

// ---------------------------------------------------------------- placing
export function place(userId, body, idempotencyKey) {
  const u = user(userId);
  if (u.status !== 'active') throw forbidden('This account is frozen, so it can\'t place orders.');
  const cfg = marketConfig(body.market);
  if (!cfg || cfg.status === 'delisted') throw notFound('That market doesn\'t exist.');
  if (cfg.status === 'halted') throw new MockError(409, 'MARKET_HALTED', `${cfg.symbol.replace('-', '/')} is halted. New orders are paused.`);

  const key = idempotencyKey ? `${userId}|${idempotencyKey}` : null;
  if (key && db().idempotency[key]) {
    const existing = db().orders.find((o) => o.id === db().idempotency[key]);
    if (existing) return toOrderDto(existing);
  }

  const order = {
    market: cfg.symbol,
    side: body.side === 'sell' ? 'sell' : 'buy',
    type: body.type === 'market' ? 'market' : 'limit',
    price: body.type === 'market' ? null : String(body.price ?? ''),
    quantity: body.type === 'market' && body.side !== 'sell' ? null : String(body.quantity ?? ''),
    quoteQuantity: body.type === 'market' && body.side !== 'sell' ? String(body.quoteQuantity ?? '') : null,
  };
  const free = Object.fromEntries(wallet.balances(userId).map((b) => [b.asset, b.available]));
  const check = rules.validate(cfg, order, free);
  if (!check.ok) {
    const first = Object.values(check.errors)[0];
    if (first.code === 'balance') throw new MockError(422, 'INSUFFICIENT_BALANCE', `Not enough ${first.asset} available.`, check.errors);
    if (first.code === 'halted') throw new MockError(409, 'MARKET_HALTED', 'This market is halted.');
    throw new MockError(422, 'MARKET_RULES', 'The order breaks the market\'s rules.', check.errors);
  }

  const now = new Date().toISOString();
  const quoteDp = wallet.decimalsOf(cfg.quoteAsset);
  const record = {
    id: newId(),
    market: cfg.symbol, side: order.side, type: order.type,
    timeInForce: order.type === 'limit' ? 'GTC' : 'IOC',
    price: order.price && money.fixed(order.price, money.decimalsOf(cfg.tickSize)),
    quantity: order.quantity && money.fixed(order.quantity, stepDp(cfg)),
    quoteQuantity: order.quoteQuantity && money.fixed(order.quoteQuantity, quoteDp),
    filledQuantity: money.fixed('0', stepDp(cfg)),
    executedQuote: money.fixed('0', quoteDp),
    avgPrice: null,
    fee: money.fixed('0', wallet.decimalsOf(order.side === 'buy' ? cfg.baseAsset : cfg.quoteAsset)),
    feeAsset: order.side === 'buy' ? cfg.baseAsset : cfg.quoteAsset,
    status: 'pending', cancelReason: null, rejectReason: null,
    clientOrderId: idempotencyKey ?? crypto.randomUUID(),
    createdAt: now, updatedAt: now, appliedAt: null,
    userId,
  };
  const lock = rules.lockFor(cfg, record);
  wallet.lock(userId, lock.asset, lock.amount, 'order_lock', { refType: 'order', refId: record.id, time: now });
  db().orders.push(record);
  if (key) db().idempotency[key] = record.id;
  pushOrder(record);
  market.noteCommand(cfg.symbol, 'place');
  setTimeout(() => apply(record.id), wait(APPLY_DELAY));
  return toOrderDto(record);
}

// ---------------------------------------------------------------- the engine applies an order
function settle(order, fill, role, tradeId, time) {
  const cfg = marketConfig(order.market);
  const base = cfg.baseAsset;
  const quote = cfg.quoteAsset;
  const quoteAmount = money.mul(fill.price, fill.quantity);
  const rate = role === 'maker' ? cfg.makerFeeRate : cfg.takerFeeRate;
  const feeAsset = order.side === 'buy' ? base : quote;
  const fee = money.round(money.mul(order.side === 'buy' ? fill.quantity : quoteAmount, rate, 'up'), wallet.decimalsOf(feeAsset), 'ceil');
  const ref = { refType: 'trade', refId: tradeId, time };

  if (order.side === 'buy') {
    wallet.debitLocked(order.userId, quote, quoteAmount, 'trade_debit', ref);
    wallet.credit(order.userId, base, fill.quantity, 'trade_credit', ref);
    wallet.debit(order.userId, base, fee, 'trade_fee', ref);
    // A limit buy that fills below its price gives the difference back.
    if (order.type === 'limit' && money.lt(fill.price, order.price)) {
      const improvement = money.mul(money.sub(order.price, fill.price), fill.quantity);
      wallet.unlock(order.userId, quote, improvement, 'order_unlock', { refType: 'order', refId: order.id, time, note: 'Price improvement' });
    }
  } else {
    wallet.debitLocked(order.userId, base, fill.quantity, 'trade_debit', ref);
    wallet.credit(order.userId, quote, quoteAmount, 'trade_credit', ref);
    wallet.debit(order.userId, quote, fee, 'trade_fee', ref);
  }

  const sDp = stepDp(cfg);
  const qDp = wallet.decimalsOf(quote);
  order.filledQuantity = money.fixed(money.add(order.filledQuantity, fill.quantity), sDp);
  order.executedQuote = money.fixed(money.add(order.executedQuote, quoteAmount), qDp);
  order.fee = money.fixed(money.add(order.fee, fee), wallet.decimalsOf(feeAsset));
  order.avgPrice = money.fixed(money.div(order.executedQuote, order.filledQuantity, 8), money.decimalsOf(cfg.tickSize));
  order.updatedAt = time;
  const target = order.quantity;
  order.status = target && money.gte(order.filledQuantity, target) ? 'filled' : 'partially_filled';

  db().fills.push({
    id: tradeId, orderId: order.id, market: order.market, side: order.side, role,
    price: fill.price, quantity: fill.quantity, quoteQuantity: money.fixed(quoteAmount, qDp),
    fee: money.fixed(fee, wallet.decimalsOf(feeAsset)), feeAsset, time, userId: order.userId,
  });
}

function apply(orderId) {
  const order = db().orders.find((o) => o.id === orderId);
  // A timer from before a demo reset: the reset replays pending orders itself.
  if (!order || order.status !== 'pending' || !market.has(order.market)) return;
  const cfg = marketConfig(order.market);
  const now = new Date().toISOString();

  if (cfg.status !== 'active' || market.status(order.market) !== 'active') {
    order.status = 'rejected';
    order.rejectReason = 'The market was halted when the engine received the order.';
    order.updatedAt = now;
    const lock = rules.lockFor(cfg, order);
    wallet.unlock(order.userId, lock.asset, lock.amount, 'order_unlock', { refType: 'order', refId: order.id, time: now, note: 'Rejected' });
    pushOrder(order);
    notify(order.userId, 'order_cancelled', 'Order rejected', `${order.market.replace('-', '/')} was halted, so the order didn't reach the book.`, '/orders?tab=history');
    return;
  }

  order.appliedAt = now;
  const { fills, selfTrades } = market.take(order.market, {
    side: order.side,
    limit: order.type === 'limit' ? order.price : null,
    quantity: order.quantity,
    quote: order.type === 'market' && order.side === 'buy' ? order.quoteQuantity : null,
    userId: order.userId,
  });

  for (const id of selfTrades) {
    const own = db().orders.find((o) => o.id === id);
    if (own) finishCancel(own, 'self_trade', now);
  }

  for (const f of fills) {
    f.tradeId = newId();
    settle(order, f, 'taker', f.tradeId, now);
    if (f.makerOrderId) {
      const maker = db().orders.find((o) => o.id === f.makerOrderId);
      if (maker) {
        settle(maker, f, 'maker', f.tradeId, now);
        pushOrder(maker);
        if (maker.status === 'filled') notifyFilled(maker);
      }
    }
  }

  if (order.type === 'limit') {
    if (order.status === 'pending') order.status = 'open';
    if (order.status !== 'filled') market.rest(order);
  } else {
    // Market orders are IOC. A buy stops when what is left can't buy one step
    // (dust under the minimum order is just unlocked); anything more that the
    // book couldn't fill is cancelled and unlocked.
    const left = rules.stillLocked(cfg, order);
    const filledSome = money.isPositive(order.filledQuantity);
    const dust = order.side === 'buy' && filledSome && money.lt(left.amount, cfg.minNotional);
    if (money.isPositive(left.amount)) {
      wallet.unlock(order.userId, left.asset, left.amount, 'order_unlock', { refType: 'order', refId: order.id, time: now, note: dust ? 'Unspent rest of a market buy' : 'Unfilled rest of a market order' });
    }
    if (dust || !money.isPositive(left.amount)) order.status = 'filled';
    else {
      order.status = 'cancelled';
      order.cancelReason = 'ioc_remainder';
    }
  }
  order.updatedAt = now;
  if (fills.length) market.print(order.market, fills, order.side, now);
  market.noteCommand(order.market, 'place');
  pushOrder(order);
  if (order.status === 'filled') notifyFilled(order);

  // A cancel that arrived while the order was pending runs after its place.
  if (order.cancelRequestedAt && OPEN.has(order.status)) setTimeout(() => runCancel(order.id), wait(CANCEL_DELAY));
}

function notifyFilled(order) {
  const cfg = marketConfig(order.market);
  const avg = order.avgPrice ? ` at ${grouped(order.avgPrice)}` : '';
  notify(order.userId, 'order_filled', 'Order filled', `${label(order, cfg)}${avg}`, '/orders?tab=history');
}

/** Settles a bot taker's fill against a person's resting order. */
export function makerFill({ orderId, price, quantity, tradeId, time }) {
  const order = db().orders.find((o) => o.id === orderId);
  if (!order || !OPEN.has(order.status)) return;
  settle(order, { price, quantity }, 'maker', tradeId, time);
  pushOrder(order);
  if (order.status === 'filled') notifyFilled(order);
}

// ---------------------------------------------------------------- cancelling
function finishCancel(order, reason, time = new Date().toISOString()) {
  const cfg = marketConfig(order.market);
  market.unrest(order.id);
  const left = rules.stillLocked(cfg, order);
  if (money.isPositive(left.amount)) {
    wallet.unlock(order.userId, left.asset, left.amount, 'order_unlock', { refType: 'order', refId: order.id, time, note: reason === 'user' ? null : reason });
  }
  order.status = 'cancelled';
  order.cancelReason = reason;
  order.updatedAt = time;
  pushOrder(order);
  if (reason !== 'user') {
    const why = { self_trade: 'it would have traded with your own order', market_halted: 'the market was halted', account_frozen: 'the account was frozen' }[reason] ?? 'the engine cancelled it';
    notify(order.userId, 'order_cancelled', 'Order cancelled', `${order.side === 'buy' ? 'Buy' : 'Sell'} ${order.market.replace('-', '/')} at ${order.price ? grouped(order.price) : 'market'}: ${why}.`, '/orders?tab=history');
  }
}

function runCancel(orderId) {
  const order = db().orders.find((o) => o.id === orderId);
  if (!order || !OPEN.has(order.status) || order.status === 'pending' || !market.has(order.market)) return;
  finishCancel(order, 'user');
  market.noteCommand(order.market, 'cancel');
}

export function cancel(userId, orderId) {
  const order = db().orders.find((o) => o.id === orderId && o.userId === userId);
  if (!order) throw notFound('That order doesn\'t exist.');
  if (!OPEN.has(order.status)) throw conflict('That order is already closed.');
  order.cancelRequestedAt = new Date().toISOString();
  persist();
  if (order.status !== 'pending') setTimeout(() => runCancel(order.id), wait(CANCEL_DELAY));
  return { orderId, cancelRequested: true };
}

export function cancelAll(userId, symbol) {
  const list = db().orders.filter((o) => o.userId === userId && OPEN.has(o.status) && (!symbol || o.market === symbol));
  for (const o of list) cancel(userId, o.id);
  return { cancelRequested: list.length };
}

/** Cancels every open order on a market (halt or delist), or of one user (freeze). */
export function systemCancel({ symbol, userId, reason }) {
  const list = db().orders.filter((o) => OPEN.has(o.status) && (!symbol || o.market === symbol) && (!userId || o.userId === userId));
  for (const o of list) {
    if (o.status === 'pending') {
      o.cancelRequestedAt = new Date().toISOString();
      continue;
    }
    finishCancel(o, reason);
  }
  return list.length;
}

/** On start-up the engine applies orders still pending, as after a restart. */
export function replayPending() {
  for (const o of db().orders) {
    if (o.status === 'pending') setTimeout(() => apply(o.id), wait(APPLY_DELAY) + 400);
  }
}

market.onMakerFill(makerFill);
