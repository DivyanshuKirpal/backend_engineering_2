// Order and my-trade routes (section 4, order.routes.js). Placing and cancelling
// go to the engine; the reads are Mongoose queries (order.queries.js), after a
// flush, so they include everything the engine has done. GET /orders/:id also
// returns the order's ledger entries, one of the API needs in section 7.

import { requireFields } from '../../lib/util.js';
import * as engine from '../../model/exchange/engine.js';
import * as session from '../../model/exchange/session.js';
import * as orderQueries from '../../model/services/order.queries.js';
import { flush } from '../../model/store.js';
import { fillDto, ledgerDto } from '../mappers.js';

const text = (value) => (value == null ? undefined : String(value));

/** The filters and page of a list request. */
const filters = ({ query }) => ({
  state: text(query.state),
  market: text(query.market),
  side: text(query.side),
  cursor: text(query.cursor),
  limit: Math.min(100, Math.max(1, Number(query.limit) || 25)),
});

export default [
  ['POST', '/orders', (ctx) => {
    const user = session.requireUser(ctx);
    requireFields(ctx.body, ['market', 'side', 'type']);
    const order = engine.place(user.id, ctx.body, ctx.headers['idempotency-key']);
    return { status: 202, data: { order } };
  }],

  ['GET', '/orders', async (ctx) => {
    const user = session.requireUser(ctx);
    await flush();
    const { items, nextCursor } = await orderQueries.list(user.id, filters(ctx));
    return { data: { items: items.map(engine.toOrderDto), nextCursor } };
  }],

  ['GET', '/orders/:id', async (ctx) => {
    const user = session.requireUser(ctx);
    await flush();
    const { order, fills, ledger } = await orderQueries.detail(user.id, ctx.params.id);
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

  ['GET', '/trades', async (ctx) => {
    const user = session.requireUser(ctx);
    await flush();
    const { items, nextCursor } = await orderQueries.trades(user.id, filters(ctx));
    return { data: { items: items.map(fillDto), nextCursor } };
  }],
];
