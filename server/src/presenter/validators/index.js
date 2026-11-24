// Which schema checks which part of which request. The adapter
// (view/routes/index.js) puts validate() in front of each route named here. A
// list's query string is checked as strictly as a body: ?limit=500 is a 400.

import * as admin from './admin.validator.js';
import * as auth from './auth.validator.js';
import * as kyc from './kyc.validator.js';
import * as market from './market.validator.js';
import * as order from './order.validator.js';
import * as user from './user.validator.js';
import * as wallet from './wallet.validator.js';

export const VALIDATORS = {
  'POST /auth/register': { body: auth.register },
  'POST /auth/login': { body: auth.login },
  'POST /auth/login/2fa': { body: auth.loginTwoFactor },

  'PATCH /users/me': { body: user.profile },
  'PATCH /users/me/password': { body: user.password },
  'POST /users/me/2fa/enable': { body: user.enableTwoFactor },
  'POST /users/me/2fa/disable': { body: user.disableTwoFactor },
  'GET /users/me/activity': { query: user.activity },
  'GET /notifications': { query: user.notifications },

  'GET /markets/:symbol/orderbook': { query: market.orderbook },
  'GET /markets/:symbol/candles': { query: market.candles },

  'POST /orders': { body: order.place },
  'GET /orders': { query: order.list },
  'DELETE /orders': { query: order.cancelAll },
  'GET /trades': { query: order.trades },

  'POST /wallet/deposits': { body: wallet.deposit },
  'POST /wallet/withdrawals': { body: wallet.withdrawal },
  'GET /wallet/ledger': { query: wallet.ledger },
  'GET /wallet/transactions': { query: wallet.transactions },

  'POST /kyc': { body: kyc.submit },

  'GET /admin/users': { query: admin.users },
  'PATCH /admin/users/:id/status': { body: admin.userStatus },
  'PATCH /admin/users/:id/role': { body: admin.userRole },
  'GET /admin/kyc': { query: admin.kyc },
  'GET /admin/kyc/:id/document': { query: admin.kycDocument },
  'PATCH /admin/kyc/:id': { body: admin.decision },
  'GET /admin/withdrawals': { query: admin.withdrawals },
  'PATCH /admin/withdrawals/:id': { body: admin.decision },
  'GET /admin/audit-logs': { query: admin.auditLogs },
};
