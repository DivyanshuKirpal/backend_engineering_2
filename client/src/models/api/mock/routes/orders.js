// Order and my-trade routes (section 4, order.routes.js). GET /orders/:id also
// returns the order's ledger entries, one of the API needs in section 7.

import { db } from '../db.js';
import { notFound } from '../errors.js';
import { fillDto, ledgerDto } from '../mappers.js';
import * as session from '../session.js';
import * as engine from '../engine.js';
import { cursorPage, newestFirst, oldestFirst, requireFields } from '../util.js';

const OPEN = new Set(['pending', 'open', 'partially_filled']);

export default [
  ['POST', '/orders', (ctx) => {
    const user = session.requireUser(ctx);
    requireFields(ctx.body, ['market', 'side', 'type']);
    const order = engine.place(user.id, ctx.body, ctx.headers['idempotency-key']);
    return { status: 202, data: { order } };
  }],

  ['GET', '/orders', (ctx) => {
    const user = session.requireUser(ctx);
    const state = ctx.query.state === 'history' ? 'history' : 'open';
    const list = db().orders
      .filter((o) => o.userId === user.id && (state === 'open' ? OPEN.has(o.status) : !OPEN.has(o.status)))
      .filter((o) => !ctx.query.market || o.market === ctx.query.market)
      .filter((o) => !ctx.query.side || o.side === ctx.query.side)
      .sort(newestFirst());
    return { data: cursorPage(list, ctx.query, engine.toOrderDto) };
  }],

  ['GET', '/orders/:id', (ctx) => {
    const user = session.requireUser(ctx);
    const order = db().orders.find((o) => o.id === ctx.params.id && o.userId === user.id);
    if (!order) throw notFound('That order doesn\'t exist.');
    const fills = db().fills.filter((f) => f.orderId === order.id && f.userId === user.id).sort(oldestFirst('time'));
    const tradeIds = new Set(fills.map((f) => f.id));
    const ledger = db().ledger
      .filter((e) => e.userId === user.id && ((e.refType === 'order' && e.refId === order.id) || (e.refType === 'trade' && tradeIds.has(e.refId))))
      .sort(oldestFirst('time'));
    return { data: { order: engine.toOrderDto(order), fills: fills.map(fillDto), ledger: ledger.map(ledgerDto) } };
  }],

  ['DELETE', '/orders/:id', (ctx) => {
    const user = session.requireUser(ctx);
    return { status: 202, data: engine.cancel(user.id, ctx.params.id) };
  }],

  ['DELETE', '/orders', (ctx) => {
    const user = session.requireUser(ctx);
    return { status: 202, data: engine.cancelAll(user.id, ctx.query.market) };
  }],

  ['GET', '/trades', (ctx) => {
    const user = session.requireUser(ctx);
    const list = db().fills
      .filter((f) => f.userId === user.id && (!ctx.query.market || f.market === ctx.query.market))
      .filter((f) => !ctx.query.side || f.side === ctx.query.side)
      .sort(newestFirst('time'));
    return { data: cursorPage(list, ctx.query, fillDto) };
  }],
];
