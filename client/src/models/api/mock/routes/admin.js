// Admin routes (section 4, admin.routes.js). Every change writes an audit log.
// /admin/stats, the KYC and withdrawal lists and /admin/system/health carry
// the extra fields section 7 asks for (usersNew7d, volumePrev24h,
// openOrdersBot, userDisplayName, userCreatedAt, redis and engine.markets).

import * as money from '../../../domain/money.js';
import { CONFIG_FIELDS, validateConfig, validateNewMarket } from '../../../domain/market.rules.js';
import { db, persist } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { adminUserDto, auditDto, kycDto, transactionDto } from '../mappers.js';
import * as session from '../session.js';
import * as wallet from '../wallet.js';
import * as market from '../market.js';
import { notify, systemCancel, toOrderDto } from '../engine.js';
import { marketDto } from './markets.js';
import { grouped } from '../text.js';
import { cursorPage, newestFirst, numberedPage, oldestFirst } from '../util.js';

const OPEN = new Set(['pending', 'open', 'partially_filled']);
const BOT_LEVELS_PER_SIDE = 5;
const DAY = 86400000;

const humans = () => db().users.filter((u) => !u.isBot);
const userOr404 = (id) => {
  const u = db().users.find((x) => x.id === id && !x.isBot);
  if (!u) throw notFound('That user doesn\'t exist.');
  return u;
};
const withKyc = (t) => ({ ...transactionDto(t, { admin: true }), userKycStatus: db().users.find((u) => u.id === t.userId)?.kycStatus ?? 'none' });

/** The 14 full days before today, in the browser's calendar. */
function lastFourteenDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getTime() - (14 - i) * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

export default [
  ['GET', '/admin/stats', (ctx) => {
    session.requireAdmin(ctx);
    const people = humans();
    const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
    const markets = db().markets.filter((m) => m.status !== 'delisted');
    const volume24h = money.sum(markets.map((m) => market.ticker(m.symbol).quoteVolume));
    const fees24h = money.add(db().stats.fees24h, money.mul(market.volumeSinceStart(), '0.0018'));
    const active = markets.filter((m) => market.status(m.symbol) === 'active').length;
    const openOrdersBot = active * BOT_LEVELS_PER_SIDE * 2;
    const pendingKyc = db().kyc.filter((k) => k.status === 'pending').sort(oldestFirst());
    const pendingWithdrawals = db().transactions.filter((t) => t.type === 'withdrawal' && t.status === 'pending').sort(oldestFirst());
    const days = lastFourteenDays();
    return {
      data: {
        users: people.length,
        usersNew7d: people.filter((u) => u.createdAt >= weekAgo).length,
        volume24h: money.fixed(volume24h, 2),
        volumePrev24h: db().stats.volumePrev24h,
        fees24h: money.fixed(fees24h, 2),
        openOrders: db().orders.filter((o) => OPEN.has(o.status)).length + openOrdersBot,
        openOrdersBot,
        pendingKyc: pendingKyc.length,
        pendingWithdrawals: pendingWithdrawals.length,
        oldestKycAt: pendingKyc[0]?.createdAt ?? null,
        oldestWithdrawalAt: pendingWithdrawals[0]?.createdAt ?? null,
        volumeSeries: db().stats.volumeSeries.map((d, i) => ({ day: days[i], quoteVolume: d.quoteVolume })),
      },
    };
  }],

  ['GET', '/admin/users', (ctx) => {
    session.requireAdmin(ctx);
    const q = String(ctx.query.search ?? '').trim().toLowerCase();
    const list = humans()
      .filter((u) => !q || u.email.startsWith(q) || u.displayName.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || u.displayName.toLowerCase().startsWith(q))
      .filter((u) => !ctx.query.role || u.role === ctx.query.role)
      .filter((u) => !ctx.query.status || u.status === ctx.query.status)
      .sort(newestFirst());
    return { data: numberedPage(list, ctx.query, adminUserDto) };
  }],

  ['GET', '/admin/users/:id', (ctx) => {
    session.requireAdmin(ctx);
    const u = userOr404(ctx.params.id);
    // The newest ten, plus any older order that is still open, so the page can list every open one
    const orders = db().orders.filter((o) => o.userId === u.id).sort(newestFirst());
    return {
      data: {
        user: adminUserDto(u),
        balances: wallet.balances(u.id),
        recentOrders: orders.filter((o, i) => i < 10 || OPEN.has(o.status)).map(toOrderDto),
        recentTransactions: db().transactions.filter((t) => t.userId === u.id).sort(newestFirst()).slice(0, 10).map((t) => transactionDto(t)),
      },
    };
  }],

  ['PATCH', '/admin/users/:id/status', (ctx) => {
    const admin = session.requireAdmin(ctx);
    const u = userOr404(ctx.params.id);
    const next = ctx.body?.status;
    if (!['active', 'frozen'].includes(next)) throw badRequest('Status is active or frozen.', { status: 'value' });
    if (next === 'frozen' && !String(ctx.body?.reason ?? '').trim()) throw badRequest('Give a reason for freezing.', { reason: 'required' });
    if (u.id === admin.id) throw conflict('You can\'t freeze your own account.');
    u.status = next;
    let cancelled = 0;
    if (next === 'frozen') cancelled = systemCancel({ userId: u.id, reason: 'account_frozen' });
    session.audit(admin, next === 'frozen' ? 'admin.user_frozen' : 'admin.user_unfrozen', { targetType: 'user', targetId: u.id, metadata: { reason: ctx.body?.reason ?? null, ordersCancelled: cancelled } });
    persist();
    return { data: { user: adminUserDto(u) } };
  }],

  ['PATCH', '/admin/users/:id/role', (ctx) => {
    const admin = session.requireAdmin(ctx);
    const u = userOr404(ctx.params.id);
    const role = ctx.body?.role;
    if (!['user', 'admin'].includes(role)) throw badRequest('Role is user or admin.', { role: 'value' });
    if (u.role === 'admin' && role === 'user' && humans().filter((x) => x.role === 'admin').length === 1) {
      throw conflict('There must always be at least one admin.');
    }
    const before = u.role;
    u.role = role;
    session.audit(admin, 'admin.role_changed', { targetType: 'user', targetId: u.id, metadata: { before, after: role } });
    persist();
    return { data: { user: adminUserDto(u) } };
  }],

  ['GET', '/admin/kyc', (ctx) => {
    session.requireAdmin(ctx);
    const status = ctx.query.status ?? 'pending';
    const list = db().kyc.filter((k) => k.status === status).sort(status === 'pending' ? oldestFirst() : newestFirst('reviewedAt'));
    return { data: numberedPage(list, { limit: 20, ...ctx.query }, (k) => kycDto(k, { admin: true })) };
  }],

  ['GET', '/admin/kyc/:id/document', (ctx) => {
    const admin = session.requireAdmin(ctx);
    const k = db().kyc.find((x) => x.id === ctx.params.id);
    if (!k) throw notFound('That application doesn\'t exist.');
    const image = ctx.query.image === 'selfie' ? 'selfie' : 'document';
    session.audit(admin, 'admin.kyc_document_viewed', { targetType: 'kyc', targetId: k.id, metadata: { image } });
    return { data: { placeholder: true, image } };
  }],

  ['PATCH', '/admin/kyc/:id', (ctx) => {
    const admin = session.requireAdmin(ctx);
    const k = db().kyc.find((x) => x.id === ctx.params.id);
    if (!k) throw notFound('That application doesn\'t exist.');
    if (k.status !== 'pending') throw conflict('That application has already been decided.');
    const decision = ctx.body?.decision;
    const reason = String(ctx.body?.reason ?? '').trim();
    if (!['approve', 'reject'].includes(decision)) throw badRequest('Decide approve or reject.', { decision: 'value' });
    if (decision === 'reject' && !reason) throw badRequest('Give the reason the user will see.', { reason: 'required' });
    const u = db().users.find((x) => x.id === k.userId);
    k.status = decision === 'approve' ? 'approved' : 'rejected';
    k.rejectReason = decision === 'reject' ? reason : null;
    k.reviewedAt = new Date().toISOString();
    k.reviewedBy = admin.id;
    if (u) u.kycStatus = k.status;
    session.audit(admin, decision === 'approve' ? 'admin.kyc_approved' : 'admin.kyc_rejected', { targetType: 'kyc', targetId: k.id, metadata: { reason: k.rejectReason } });
    if (u) {
      if (decision === 'approve') notify(u.id, 'kyc', 'Identity verified', 'An admin approved your identity check. Withdrawals are open.', '/account/verification');
      else notify(u.id, 'kyc', 'Identity check rejected', `${reason} You can send it again.`, '/account/verification');
    }
    persist();
    return { data: { application: kycDto(k, { admin: true }) } };
  }],

  ['GET', '/admin/withdrawals', (ctx) => {
    session.requireAdmin(ctx);
    const status = ctx.query.status ?? 'pending';
    const list = db().transactions.filter((t) => t.type === 'withdrawal' && t.status === status)
      .sort(status === 'pending' ? oldestFirst() : newestFirst('reviewedAt'));
    return { data: numberedPage(list, { limit: 20, ...ctx.query }, withKyc) };
  }],

  ['PATCH', '/admin/withdrawals/:id', (ctx) => {
    const admin = session.requireAdmin(ctx);
    const t = db().transactions.find((x) => x.id === ctx.params.id && x.type === 'withdrawal');
    if (!t) throw notFound('That withdrawal doesn\'t exist.');
    if (t.status !== 'pending') throw conflict('That withdrawal has already been decided.');
    const decision = ctx.body?.decision;
    const reason = String(ctx.body?.reason ?? '').trim();
    if (!['approve', 'reject'].includes(decision)) throw badRequest('Decide approve or reject.', { decision: 'value' });
    if (decision === 'reject' && !reason) throw badRequest('Give the reason the user will see.', { reason: 'required' });
    const now = new Date().toISOString();
    const ref = { refType: 'transaction', refId: t.id, time: now };
    const shown = `${grouped(t.amount)} ${t.asset}`;
    if (decision === 'approve') {
      wallet.debitLocked(t.userId, t.asset, money.sub(t.amount, t.fee), 'withdrawal', ref);
      wallet.debitLocked(t.userId, t.asset, t.fee, 'withdrawal_fee', ref);
      t.status = 'completed';
      t.txHash = `0x${Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
      notify(t.userId, 'withdrawal', 'Withdrawal sent', `${shown} left your wallet.`, '/wallet/history');
    } else {
      wallet.unlock(t.userId, t.asset, t.amount, 'withdrawal_unlock', { ...ref, note: reason });
      t.status = 'rejected';
      t.rejectReason = reason;
      notify(t.userId, 'withdrawal', 'Withdrawal rejected', `${shown} is back in your wallet. ${reason}`, '/wallet/history');
    }
    t.reviewedAt = now;
    session.audit(admin, decision === 'approve' ? 'admin.withdrawal_approved' : 'admin.withdrawal_rejected', { targetType: 'transaction', targetId: t.id, metadata: { reason: reason || null } });
    persist();
    return { data: { transaction: withKyc(t) } };
  }],

  ['GET', '/admin/markets', (ctx) => {
    session.requireAdmin(ctx);
    return { data: { markets: db().markets.map(marketDto) } };
  }],

  ['POST', '/admin/markets', (ctx) => {
    session.requireAdmin(ctx);
    const body = ctx.body ?? {};
    const errors = validateNewMarket(body, db().assets, db().markets);
    const codes = Object.fromEntries(Object.entries(errors).map(([field, e]) => [field, e.code]));
    if (Object.keys(errors).some((f) => errors[f].code !== 'taken')) throw badRequest('Some of the market\'s settings aren\'t valid.', codes);
    if (errors.baseAsset) throw conflict(`${errors.baseAsset.symbol.replace('-', '/')} already exists.`, codes);
    // Every rule passes. The simulator builds its books, tapes and candles from
    // seed files, so a market can't start here; in this phase every asset has one.
    throw conflict('A new market needs the matching engine on the server, which comes with the backend.');
  }],

  ['PATCH', '/admin/markets/:symbol', (ctx) => {
    const admin = session.requireAdmin(ctx);
    const config = db().markets.find((m) => m.symbol === ctx.params.symbol);
    if (!config) throw notFound('That market doesn\'t exist.');
    const body = ctx.body ?? {};
    const before = { ...config };
    // Check everything first, so a refused request changes nothing
    const changes = Object.fromEntries(CONFIG_FIELDS
      .filter((f) => body[f] != null && (!money.isDecimal(String(body[f])) || !money.eq(String(body[f]), config[f])))
      .map((f) => [f, String(body[f]).trim()]));
    const decimals = (code) => db().assets.find((a) => a.code === code)?.decimals;
    const errors = validateConfig({ ...config, ...changes }, { base: decimals(config.baseAsset) ?? 8, quote: decimals(config.quoteAsset) ?? 6 });
    const refused = Object.keys(errors).filter((f) => f in changes || (f === 'minQty' && 'stepSize' in changes));
    if (refused.length) throw badRequest('Some of the market\'s settings aren\'t valid.', Object.fromEntries(refused.map((f) => [f, errors[f].code])));
    const rules = 'tickSize' in changes || 'stepSize' in changes;
    if (rules) {
      const open = db().orders.some((o) => o.market === config.symbol && OPEN.has(o.status));
      if (config.status !== 'halted' || open) throw conflict('Tick and step change only while the market is halted with no open orders.', { [('tickSize' in changes) ? 'tickSize' : 'stepSize']: 'live' });
    }
    if (body.status && !['active', 'halted', 'delisted'].includes(body.status)) throw badRequest('Unknown status.', { status: 'value' });

    Object.assign(config, changes);
    if (rules) market.setRules(config.symbol, { tickSize: config.tickSize, stepSize: config.stepSize });
    let cancelled = 0;
    if (body.status && body.status !== config.status) {
      config.status = body.status;
      if (body.status !== 'active' && (body.cancelOpenOrders || body.status === 'delisted')) {
        cancelled = systemCancel({ symbol: config.symbol, reason: 'market_halted' });
      }
      market.setStatus(config.symbol, body.status, body.status === 'active' ? 'resume' : body.status === 'halted' ? 'halt' : 'delist');
      session.audit(admin, `admin.market_${body.status === 'active' ? 'resumed' : body.status}`, { targetType: 'market', targetId: config.symbol, metadata: { cancelOpenOrders: Boolean(body.cancelOpenOrders), ordersCancelled: cancelled } });
    }
    if (CONFIG_FIELDS.some((f) => before[f] !== config[f])) {
      session.audit(admin, 'admin.market_updated', { targetType: 'market', targetId: config.symbol, metadata: { before, after: { ...config } } });
    }
    persist();
    return { data: { market: marketDto(config) } };
  }],

  ['GET', '/admin/assets', (ctx) => {
    session.requireAdmin(ctx);
    return { data: { assets: db().assets.map((a) => ({ ...a })) } };
  }],

  ['GET', '/admin/audit-logs', (ctx) => {
    session.requireAdmin(ctx);
    const list = db().audit
      .filter((a) => (!ctx.query.action || a.action === ctx.query.action) && (!ctx.query.actorId || a.actor?.id === ctx.query.actorId))
      .sort(newestFirst());
    return { data: cursorPage(list, ctx.query, auditDto) };
  }],

  ['GET', '/admin/system/health', (ctx) => {
    session.requireAdmin(ctx);
    const seed = db().health;
    const engineMarkets = market.engineMarkets();
    const waiting = engineMarkets.reduce((n, m) => n + m.waiting, 0);
    const jitter = (n, spread) => n + Math.round((Math.random() - 0.5) * 2 * spread);
    const api1 = jitter(21, 2);
    const api2 = jitter(17, 2);
    return {
      data: {
        checkedAt: new Date().toISOString(),
        mongo: { ...seed.mongo, pingMs: jitter(3, 1) },
        redis: { ...seed.redis, usedMemory: jitter(seed.redis.usedMemory, 400000) },
        engine: {
          leaderId: seed.engine.leaderId,
          heartbeatAge: market.heartbeatAge(),
          marketsLoaded: engineMarkets.length,
          streamLag: waiting,
          oldestWaitMs: waiting ? jitter(200, 80) : 0,
          markets: engineMarkets,
        },
        apiInstances: [{ id: 'api-1', ready: true, sockets: api1 }, { id: 'api-2', ready: true, sockets: api2 }],
        sockets: api1 + api2,
      },
    };
  }],
];
