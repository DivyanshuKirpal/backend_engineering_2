// Wallet endpoints (section 4, Wallet). Deposits and withdrawals send an
// Idempotency-Key, so a retried request can't move money twice.

import { get, del, post, idempotencyKey } from './http.js';

/** -> { balances: [Balance] } */
export const balances = () => get('/wallet/balances');
/** -> { items: [LedgerEntry], nextCursor, total }; `types` is a list of entry types */
export const ledger = ({ asset, types, cursor, limit } = {}) => get('/wallet/ledger', { asset, type: types?.length ? types.join(',') : undefined, cursor, limit });
/** -> { items: [Transaction], nextCursor } */
export const transactions = ({ type, status, cursor, limit } = {}) => get('/wallet/transactions', { type, status, cursor, limit });
/** -> { asset, address } */
export const depositAddress = (asset) => get(`/wallet/deposit-address/${encodeURIComponent(asset)}`);
/** -> { transaction, balance } (201) */
export const deposit = ({ asset, amount }) => post('/wallet/deposits', { asset, amount }, { 'Idempotency-Key': idempotencyKey() });
/** -> { checkoutUrl } (stretch; the mock answers that it needs the backend) */
export const cardDeposit = ({ amount }) => post('/wallet/deposits/card', { amount });
/** -> { transaction } with status pending (201) */
export const withdraw = ({ asset, amount, address, code }) => post('/wallet/withdrawals', { asset, amount, address, code }, { 'Idempotency-Key': idempotencyKey() });
/** -> { transaction } */
export const cancelWithdrawal = (id) => del(`/wallet/withdrawals/${encodeURIComponent(id)}`);
