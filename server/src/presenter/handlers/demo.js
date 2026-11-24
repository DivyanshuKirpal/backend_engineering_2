// Demo routes under /api/v1/demo, an addition to section 4 (the plan's
// departures table). In the static phase the Simulator menu and the checks
// reached into the mock directly; on a server they ask over HTTP.
//
// Mounted only with DEMO_CONTROLS=true (view/routes/index.js):
//   POST /demo/reset       throws the demo data away and seeds it again. On a
//                          server that is everyone's data, not one browser's.
//   POST /demo/fail-next   the next API request from this browser answers 503,
//                          to show a page's error state
// With TEST_ROUTES=true as well, the routes only the checks use:
//   POST /demo/kyc-status      sets a user's identity check, as an admin's decision would
//   POST /demo/email-verified  confirms a user's email, so the verify banner goes
//   GET  /demo/db              a read-only snapshot of the working set (?only=orders,audit)

import { badRequest, notFound } from '../../lib/errors.js';
import { lower, newestFirst } from '../../lib/util.js';
import * as lifecycle from '../../model/exchange/lifecycle.js';
import { db, persist } from '../../model/store.js';

/**
 * The switch for fail-next is a cookie, so it stays with the browser that
 * asked: another visitor's requests, such as the admin's in a second window,
 * go through. middleware/failNext.js reads it.
 */
export const FAIL_NEXT = {
  name: 'fail_next',
  options: { httpOnly: true, sameSite: 'strict', path: '/api/v1' },
};

const KYC_STATUSES = ['none', 'pending', 'approved', 'rejected'];

const userByEmail = (email) => {
  const user = db().users.find((u) => u.email === lower(email));
  if (!user) throw notFound('No user has that email.');
  return user;
};

export const demoRoutes = [
  ['POST', '/demo/reset', async () => {
    await lifecycle.reset();
    return { data: { reset: true } };
  }],

  ['POST', '/demo/fail-next', (ctx) => {
    ctx.cookies.set(FAIL_NEXT.name, '1', { ...FAIL_NEXT.options, maxAge: 10 * 60 * 1000 });
    return { data: { armed: true } };
  }],
];

export const testRoutes = [
  ['POST', '/demo/kyc-status', (ctx) => {
    const { email, status, reason = null } = ctx.body ?? {};
    const user = userByEmail(email);
    if (!KYC_STATUSES.includes(status)) throw badRequest('Status is none, pending, approved or rejected.', { status: 'value' });
    user.kycStatus = status;
    if (status === 'none') {
      // Not started: the user's applications go too
      db().kyc = db().kyc.filter((k) => k.userId !== user.id);
    } else if (status === 'approved' || status === 'rejected') {
      // The latest application gets the decision, as an admin's would give it
      const latest = db().kyc.filter((k) => k.userId === user.id).sort(newestFirst())[0];
      if (latest) {
        latest.status = status;
        latest.rejectReason = status === 'rejected' ? reason : null;
        latest.reviewedAt = new Date().toISOString();
      }
    }
    persist();
    return { data: { email: user.email, kycStatus: user.kycStatus } };
  }],

  ['POST', '/demo/email-verified', (ctx) => {
    const user = userByEmail(ctx.body?.email);
    user.emailVerified = true;
    persist();
    return { data: { email: user.email, emailVerified: true } };
  }],

  ['GET', '/demo/db', (ctx) => {
    // No password hash is ever in the working set, and no token is kept anywhere.
    const data = db();
    const only = ctx.query.only ? String(ctx.query.only).split(',') : Object.keys(data);
    return { data: Object.fromEntries(only.filter((key) => key in data).map((key) => [key, data[key]])) };
  }],
];
