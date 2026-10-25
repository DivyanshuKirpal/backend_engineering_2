// Wallet routes (section 4, wallet.routes.js). The ledger takes a comma-
// separated ?type= list and returns a total, and transactions take ?status=:
// both are API needs from section 7, added to the mock and still pending for
// the real API.

import * as money from '../../../domain/money.js';
import * as withdrawalRules from '../../../domain/withdrawal.rules.js';
import { db, newId, persist } from '../db.js';
import { MockError, badRequest, conflict, notFound } from '../errors.js';
import { ledgerDto, transactionDto } from '../mappers.js';
import * as session from '../session.js';
import * as wallet from '../wallet.js';
import { notify } from '../engine.js';
import { grouped } from '../text.js';
import { cursorPage, newestFirst, requireFields } from '../util.js';

const asset = (code) => {
  const a = db().assets.find((x) => x.code === String(code ?? '').toUpperCase() && x.status === 'active');
  if (!a) throw notFound('That asset doesn\'t exist.');
  return a;
};
const fakeHash = () => `0x${Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

function newTransaction(user, fields) {
  const now = new Date().toISOString();
  const t = {
    id: newId(), method: 'simulated', fee: '0', receiveAmount: null, fiatAmount: null, fiatCurrency: null,
    txHash: null, rejectReason: null, createdAt: now, reviewedAt: null,
    userId: user.id, userEmail: user.email, userDisplayName: user.displayName,
    ...fields,
  };
  db().transactions.push(t);
  return t;
}

export default [
  ['GET', '/wallet/balances', (ctx) => ({ data: { balances: wallet.balances(session.requireUser(ctx).id) } })],

  ['GET', '/wallet/ledger', (ctx) => {
    const user = session.requireUser(ctx);
    const types = ctx.query.type ? new Set(String(ctx.query.type).split(',')) : null;
    // Newest first; entries written in the same millisecond keep their write order, reversed.
    const list = db().ledger
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.userId === user.id && (!ctx.query.asset || e.asset === ctx.query.asset) && (!types || types.has(e.type)))
      .sort((a, b) => (a.e.time < b.e.time ? 1 : a.e.time > b.e.time ? -1 : b.i - a.i))
      .map(({ e }) => e);
    return { data: { ...cursorPage(list, ctx.query, ledgerDto), total: list.length } };
  }],

  ['GET', '/wallet/transactions', (ctx) => {
    const user = session.requireUser(ctx);
    const list = db().transactions
      .filter((t) => t.userId === user.id && (!ctx.query.type || t.type === ctx.query.type) && (!ctx.query.status || t.status === ctx.query.status))
      .sort(newestFirst());
    return { data: cursorPage(list, ctx.query, (t) => transactionDto(t)) };
  }],

  ['GET', '/wallet/deposit-address/:asset', (ctx) => {
    const user = session.requireUser(ctx);
    const a = asset(ctx.params.asset);
    let entry = db().addresses.find((x) => x.userId === user.id && x.asset === a.code);
    if (!entry) {
      const hex = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
      entry = { userId: user.id, asset: a.code, address: `sim-${a.code.toLowerCase()}-${hex}` };
      db().addresses.push(entry);
      persist();
    }
    return { data: { asset: a.code, address: entry.address } };
  }],

  ['POST', '/wallet/deposits', (ctx) => {
    const user = session.requireUser(ctx);
    if (user.status !== 'active') throw new MockError(403, 'FORBIDDEN', 'This account is frozen, so it can\'t deposit.');
    requireFields(ctx.body, ['asset', 'amount']);
    const a = asset(ctx.body.asset);
    if (!a.depositEnabled) throw conflict(`${a.code} deposits are switched off.`);
    const amount = String(ctx.body.amount).trim();
    if (!money.isDecimal(amount) || !money.isPositive(amount)) throw badRequest('Enter an amount above zero.', { amount: 'required' });
    if (!money.fitsDecimals(amount, a.decimals)) throw badRequest(`${a.code} amounts have at most ${a.decimals} decimals.`, { amount: 'decimals' });
    if (money.gt(amount, a.demoDepositLimit)) throw badRequest(`Simulated deposits are at most ${grouped(a.demoDepositLimit)} ${a.code}.`, { amount: 'limit' });
    const key = ctx.headers['idempotency-key'] ? `${user.id}|${ctx.headers['idempotency-key']}` : null;
    if (key && db().idempotency[key]) {
      const t = db().transactions.find((x) => x.id === db().idempotency[key]);
      if (t) return { status: 201, data: { transaction: transactionDto(t), balance: wallet.balance(user.id, a.code) } };
    }
    const address = db().addresses.find((x) => x.userId === user.id && x.asset === a.code)?.address ?? `sim-${a.code.toLowerCase()}-0000000000000000`;
    const t = newTransaction(user, {
      type: 'deposit', asset: a.code, amount: money.fixed(amount, a.decimals), fee: money.fixed('0', a.decimals),
      address, txHash: fakeHash(), status: 'completed',
    });
    if (key) db().idempotency[key] = t.id;
    wallet.credit(user.id, a.code, amount, 'deposit', { refType: 'transaction', refId: t.id, time: t.createdAt });
    notify(user.id, 'deposit', 'Deposit completed', `${grouped(money.fixed(amount, a.code === 'USDT' ? 2 : a.decimals))} ${a.code} is in your wallet.`, '/wallet/history');
    persist();
    return { status: 201, data: { transaction: transactionDto(t), balance: wallet.balance(user.id, a.code) } };
  }],

  ['POST', '/wallet/deposits/card', () => {
    throw new MockError(503, 'INTERNAL', 'Card deposits use Stripe test mode, which needs the backend.');
  }],

  ['POST', '/wallet/withdrawals', (ctx) => {
    const user = session.requireUser(ctx);
    if (user.status !== 'active') throw new MockError(403, 'FORBIDDEN', 'This account is frozen, so it can\'t withdraw.');
    if (user.kycStatus !== 'approved') throw new MockError(403, 'KYC_REQUIRED', 'Verify your identity before withdrawing.');
    requireFields(ctx.body, ['asset', 'amount', 'address']);
    const a = asset(ctx.body.asset);
    if (user.twoFactorEnabled) {
      const expected = db().credentials[user.email]?.twoFactorCode;
      if (String(ctx.body.code ?? '') !== expected) throw new MockError(400, 'INVALID_2FA_CODE', 'That code didn\'t work.', { attemptsLeft: null });
    }
    const free = wallet.balance(user.id, a.code).available;
    const check = withdrawalRules.validate(a, { address: ctx.body.address, amount: String(ctx.body.amount), code: ctx.body.code ?? '000000' }, free, { ...user, twoFactorEnabled: false });
    if (!check.ok) {
      const [field, err] = Object.entries(check.errors)[0];
      if (err.code === 'balance') throw new MockError(422, 'INSUFFICIENT_BALANCE', `Not enough ${a.code} available.`, check.errors);
      throw badRequest(`Check the ${field}.`, check.errors);
    }
    const key = ctx.headers['idempotency-key'] ? `${user.id}|${ctx.headers['idempotency-key']}` : null;
    if (key && db().idempotency[key]) {
      const t = db().transactions.find((x) => x.id === db().idempotency[key]);
      if (t) return { status: 201, data: { transaction: transactionDto(t) } };
    }
    const amount = money.fixed(ctx.body.amount, a.decimals);
    const t = newTransaction(user, {
      type: 'withdrawal', asset: a.code, amount, fee: money.fixed(a.withdrawFee, a.decimals),
      receiveAmount: money.fixed(money.sub(amount, a.withdrawFee), a.decimals),
      address: String(ctx.body.address).trim(), status: 'pending',
    });
    if (key) db().idempotency[key] = t.id;
    wallet.lock(user.id, a.code, amount, 'withdrawal_lock', { refType: 'transaction', refId: t.id, time: t.createdAt });
    session.audit(user, 'wallet.withdrawal_requested', { targetType: 'transaction', targetId: t.id });
    persist();
    return { status: 201, data: { transaction: transactionDto(t) } };
  }],

  ['DELETE', '/wallet/withdrawals/:id', (ctx) => {
    const user = session.requireUser(ctx);
    const t = db().transactions.find((x) => x.id === ctx.params.id && x.userId === user.id && x.type === 'withdrawal');
    if (!t) throw notFound('That withdrawal doesn\'t exist.');
    if (t.status !== 'pending') throw conflict('Only a pending withdrawal can be cancelled.');
    t.status = 'cancelled';
    t.reviewedAt = new Date().toISOString();
    wallet.unlock(user.id, t.asset, t.amount, 'withdrawal_unlock', { refType: 'transaction', refId: t.id, note: 'Cancelled by you' });
    persist();
    return { data: { transaction: transactionDto(t) } };
  }],
];
