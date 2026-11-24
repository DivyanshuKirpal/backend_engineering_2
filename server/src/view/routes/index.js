// The /api/v1 router and the adapter that mounts the handler tables on it.
//
// Each handler file (presenter/handlers/) exports rows of [method, path,
// handler], as the mock had them. A handler takes a context and returns
// { status, data }; it never touches Express. The adapter registers each row
// with router.get/post/patch/put/delete, builds the context from Express's req
// and res, calls the handler, and answers through respond.js. A thrown
// ApiError goes to middleware/errorHandler.js by itself (Express 5).
//
// In front of every route: wait for the exchange (a demo reset may be under
// way), plus the mock's simulated network delay when DEMO_LATENCY is on; with
// DEMO_CONTROLS, the fail-next switch; then authenticate, which finds out who is
// asking. The private groups need a signed-in user, and /admin an admin.

import { Router } from 'express';
import multer from 'multer';
import { mongoState } from '../../config/db.js';
import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/authorize.js';
import { failNext } from '../../middleware/failNext.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { whenReady } from '../../model/exchange/lifecycle.js';
import { flush, flushState } from '../../model/store.js';
import admin from '../../presenter/handlers/admin.js';
import auth from '../../presenter/handlers/auth.js';
import { demoRoutes, testRoutes } from '../../presenter/handlers/demo.js';
import kyc from '../../presenter/handlers/kyc.js';
import markets from '../../presenter/handlers/markets.js';
import notifications from '../../presenter/handlers/notifications.js';
import orders from '../../presenter/handlers/orders.js';
import users from '../../presenter/handlers/users.js';
import wallet from '../../presenter/handlers/wallet.js';
import { accepted, created, noContent, ok } from '../http/respond.js';

export const ROUTES = [...auth, ...users, ...markets, ...orders, ...wallet, ...kyc, ...notifications, ...admin];

const ANSWER = { 200: ok, 201: created, 202: accepted, 204: noContent };

// POST /kyc sends a FormData body (multipart/form-data): text fields plus up to
// two images, which Multer reads into memory. Size limits and saving the
// files come in M8.
const kycFiles = multer({ storage: multer.memoryStorage() })
  .fields([{ name: 'documentImage', maxCount: 1 }, { name: 'selfieImage', maxCount: 1 }]);

const LATENCY = { GET: [140, 380], WRITE: [220, 520] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exchangeReady(req, res, next) {
  await whenReady();
  if (env.DEMO_LATENCY) {
    const [lo, hi] = req.method === 'GET' ? LATENCY.GET : LATENCY.WRITE;
    await sleep(lo + Math.random() * (hi - lo));
    await whenReady();
  }
  next();
}

/** The context a handler gets: what the mock built from a request, now from Express's req and res. */
function context(req, res) {
  const body = req.body || req.files ? { ...req.body } : null;
  // Each uploaded file in the shape the handlers read from a browser File
  for (const [field, [file]] of Object.entries(req.files ?? {})) {
    body[field] = { name: file.originalname, type: file.mimetype, size: file.size };
  }
  return {
    method: req.method,
    path: req.path,
    params: req.params,
    query: { ...req.query },
    body,
    headers: req.headers,
    cookies: {
      get: (name) => req.cookies?.[name],
      set: (name, value, options) => res.cookie(name, value, options),
      clear: (name, options) => res.clearCookie(name, options),
    },
    userAgent: req.get('user-agent') ?? '',
    ip: (req.ip ?? '').replace(/^::ffff:/, ''), // an IPv4 address, not IPv6's mapped form
    user: req.user,
    session: req.session,
  };
}

function adapt(handler) {
  return async (req, res) => {
    let result;
    try {
      result = await handler(context(req, res));
    } finally {
      // What a write changed is in MongoDB before it is answered. A refused one
      // may have changed something too, such as a count of failed logins.
      if (req.method !== 'GET') await flush();
    }
    const { status = 200, data } = result;
    const answer = ANSWER[status];
    if (!answer) throw new Error(`A handler returned status ${status}, which respond.js has no answer for`);
    answer(res, data);
  };
}

function mount(router, table) {
  for (const [method, path, handler] of table) {
    const before = method === 'POST' && path === '/kyc' ? [kycFiles] : [];
    router[method.toLowerCase()](path, ...before, adapt(handler));
  }
}

export const apiRouter = Router();

// GET /api/v1/health answers at once, even during a reset: the process is up,
// whether its MongoDB connection is, and whether the last flush got through.
apiRouter.get('/health', (req, res) => {
  ok(res, {
    status: 'ok',
    mongo: mongoState(),
    flush: flushState(),
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});

const PRIVATE = ['/users', '/orders', '/trades', '/wallet', '/kyc', '/notifications'];

apiRouter.use(exchangeReady);
if (env.DEMO_CONTROLS) apiRouter.use(failNext);
apiRouter.use(authenticate);
apiRouter.use(PRIVATE, requireAuth);
apiRouter.use('/admin', requireAuth, requireAdmin);
if (env.DEMO_CONTROLS) {
  mount(apiRouter, demoRoutes);
  if (env.TEST_ROUTES) mount(apiRouter, testRoutes);
}
mount(apiRouter, ROUTES);
