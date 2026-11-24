# Orichal server phase (CE-2): plan, checklist and log

This phase gives Orichal its first real server before the CE-2 evaluation (25 Nov to 3 Dec 2026). It ends at MongoDB with Mongoose. Everything after that (Redis, a separate engine process, Docker, deployment, React) waits for the final evaluation.

`CLAUDE.md` holds the standing rules. The architecture declaration (revision 3) stays the plan for the full build; section 8 of this file lists where this phase departs from it.

## Contents

1. Starting point
2. Scope
3. Decisions
4. Folder layout
5. Environment and MongoDB
6. Milestones
7. CHO coverage
8. Departures from the architecture declaration
9. Viva ownership
10. The CE-2 demo
11. If the slot is 25 or 26 November
12. Checklist
13. Log

## 1. Starting point (22 Nov 2026)

- GitHub: `main` and `frontend-static` both at `3576717` "Close the static phase" (26 Oct). One local commit, `ea574d9` (27 Oct, `docs/frontend-guide.md`), is not pushed yet.
- Client: 24 Core pages in plain HTML, CSS and JavaScript with the MVP layers. 466 behaviour checks in 22 files and 3,947 data checks on 26 seed files pass.
- Backend: `client/src/models/api/mock/` answers all 61 endpoints inside the browser with section 4's envelope and DTOs. It has a matching engine, a market simulator, a wallet that writes a ledger entry for every change, and a fake socket. `server/` holds only a README.
- Tested on 22 Nov: the mock runs unchanged in Node 22 once three browser features are replaced (`localStorage`, `fetch` for the seed files, `addEventListener`). Markets, admin login and stats, the demo login with its 2FA step, a 202 order, and the 401 answers for a missing token and a wrong password all came back correct. This phase therefore moves that code behind Express and builds on it, instead of rewriting 61 endpoints.

## 2. Scope

In this phase:

- Express 5 serving the client and the REST API under `/api/v1` from one origin
- Socket.IO for the live events (tickers, books, trades, candles, order and balance updates)
- MongoDB with Mongoose for users, sessions, wallets, ledger entries, orders and trades
- The other collections in `server/data/store.json` (transactions, KYC applications, notifications, audit logs, deposit addresses, markets and assets config, stats, health, idempotency keys; until M4 the watchlists and until M5 the demo passwords, which then move into the user documents)
- bcryptjs password hashes, JWT access tokens, the rotating `rt` refresh cookie, auth and role middleware
- Zod validation, Multer uploads for KYC images, error mapping for every database and upload error
- A Postman collection with tests, run from the command line with Newman
- The behaviour checks running against the real server

After CE-2: React and Vite, Redis (cache, rate limits, Streams, Pub/Sub), a separate engine process with a leader lock, multi-document transactions, Docker, Nginx, CI, deployment, TOTP, Google sign-in, email, Cloudinary, Stripe, the 9 stretch pages and the dark theme.

## 3. Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Runtime and modules | Node 22, ES modules | The server reuses the mock's modules and the client's domain rules, which are ES modules |
| Packages | One `package.json` at the root | One `npm install` for client tooling, server and checks |
| Origin and port | Express serves `client/` and `/api/v1` on port 5173 | Same origin: no CORS, the `rt` cookie stays first-party, and `localhost:5173` in the docs stays true |
| Server code | The mock's handlers, engine, simulator, wallet and session code move to `server/src` | They already follow section 4, and the client keeps working at every step |
| Shared rules | The server imports `client/src/models/domain/` (money, order, market and password rules) | One implementation of money and order rules on both sides |
| Data | MongoDB for the six collections above; the rest in `server/data/store.json` | CE-2 scope; the rest moves for the final evaluation |
| Working set | The engine and simulator work on an in-memory copy. `store.flush()` writes changes to MongoDB before a write request is answered, and within 200 ms for background changes | The core is synchronous code over arrays, and exchanges keep their books in memory anyway |
| Direct queries | Auth (users, sessions) and the order and trade reads use Mongoose queries. After a direct write, `store.remember()` updates the working set | The course's MongoDB topics, on the two flows a viva is most likely to ask about |
| Money | Strings in the API, BigInt (`money.js`) in code, Decimal128 in MongoDB | Section 3; floats lose money |
| Ids | Hex strings in the API and the working set, ObjectId in MongoDB | Populate only matches ObjectId references |
| Trades | One document per side of a fill, linked by `tradeId` | Most fills meet the bot's anonymous ladder, which has no order document |
| Passwords | bcryptjs, cost from `BCRYPT_ROUNDS` (12; 4 in the checks) | Pure JavaScript, so no native build on Windows |
| Tokens | Access JWT `{ sub, role, sid }` for 15 minutes, kept in memory by the client; refresh JWT `{ sid, ver }` in the `rt` cookie, rotated as section 4 says | Section 4 |
| 2FA | The demo's fixed code (123456), stored as a bcrypt hash | TOTP comes later |
| Validation | Zod | Section 1's choice |
| Uploads | Multer, memory storage, JPEG or PNG up to 5 MB, saved under `server/data/uploads/` | Cloudinary comes later |
| Logging | morgan | The course's logger; pino comes later |
| Real time | Socket.IO 4, WebSocket transport only; the client imports the vendored ESM build (`socket.io-client/dist/socket.io.esm.min.js`) | The client has no build step |
| Tests | Behaviour checks against the real server (a fresh store per file, `mongodb-memory-server` from M4), Postman with Newman, `db:check-ledger` and `db:explain` | Section 7.3 of the report needs real API testing |

## 4. Folder layout

```text
server/
├── README.md                        # how to run the server
├── .env.example                     # every variable, safe example values
├── data/                            # git-ignored: store.json, uploads/
├── src/
│   ├── server.js                    # connects MongoDB, opens the store, starts the simulator, HTTP + Socket.IO on PORT
│   ├── app.js                       # helmet, morgan, express.json, cookie-parser, /api/v1, static client + fallback, notFound, errorHandler
│   ├── config/
│   │   ├── env.js                   # process.loadEnvFile + Zod check of the variables
│   │   └── db.js                    # mongoose.connect and connection events
│   ├── model/                       # MODEL
│   │   ├── schemas/                 # User, Session, Wallet, LedgerEntry, Order, Trade
│   │   ├── services/                # auth.service, token.service (M5, M6), order.queries (M7)
│   │   ├── exchange/                # from the mock: engine, market (simulator), wallet, session, bus, text
│   │   └── store.js                 # from mock/db.js: the working set, the JSON file, MongoDB load and flush
│   ├── presenter/                   # PRESENTER
│   │   ├── handlers/                # from mock/routes: [method, path, handler] tables, plus demo.js
│   │   ├── validators/              # Zod schemas (M8)
│   │   └── mappers.js               # records to DTOs; documents to records and back (M3)
│   ├── view/                        # VIEW
│   │   ├── routes/index.js          # mounts the handler tables on an Express router (the adapter)
│   │   ├── http/respond.js          # the envelope
│   │   └── sockets/gateway.js       # Socket.IO: handshake, rooms, the bus relay
│   ├── middleware/                  # authenticate, requireAuth, authorize, validate, upload, notFound, errorHandler
│   └── lib/                         # errors.js (ApiError), util.js, cursor.js
└── scripts/
    ├── seed.js                      # MongoDB and the JSON store from client/src/models/data
    ├── check-ledger.js              # aggregation: every wallet against its ledger
    └── explain.js                   # query plans for the order, trade and ledger queries

docs/
├── server-plan.md                   # this file
├── backend-guide.md                 # the server explained for the viva, one section per milestone
└── postman/
    ├── crypto-exchange.postman_collection.json
    └── local.postman_environment.json
```

## 5. Environment and MongoDB

`server/.env` is git-ignored; `server/.env.example` is committed. `config/env.js` reads the file with `process.loadEnvFile()` (missing file allowed) and checks the values with Zod, exiting with a clear message on a bad one. Names follow section 1 where it has them.

| Variable | Example | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` hides error details |
| `PORT` | `5173` | One origin for the client and the API |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/orichal` | Atlas SRV string or local MongoDB, database `orichal` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two different long random strings | Signing keys |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` | `15m`, `7d` | Token lifetimes |
| `BCRYPT_ROUNDS` | `12` | Hash cost; the checks use 4 |
| `DEMO_CREDIT_USDT` | `10000` | Sign-up credit |
| `STORE_FILE` | `server/data/store.json` | The JSON store; each check file gets its own |
| `SEED_ON_START` | `false` | Seed an empty database at start (the checks use `true`) |
| `DEMO_CONTROLS` | `true` | Mounts `/api/v1/demo/reset` and `/fail-next` for the Simulator menu |
| `DEMO_LATENCY` | `false` | The mock's simulated network delay; the checks turn it on because some of them look for loading states |
| `TEST_ROUTES` | `false` | With `DEMO_CONTROLS`, mounts the routes only the checks use |

MongoDB, two ways (set up both before the evaluation):

1. Atlas: a free M0 cluster, a database user, the laptop's IP under Network Access, and the SRV string with `/orichal` in `MONGO_URI`.
2. Local fallback: MongoDB Community Server and Compass on each demo laptop, `MONGO_URI=mongodb://127.0.0.1:27017/orichal`.

Test Atlas on campus Wi-Fi before the slot. Many campus networks block port 27017; if Atlas doesn't connect there, demo on the local database after `npm run seed`.

## 6. Milestones

Every milestone ends the same way (CLAUDE.md, Working): its checks pass; from M2 on `npm run checks` and `npm run check:data` pass too; the checklist below is ticked and the log has a dated entry; `docs/backend-guide.md` gains a section on the new code; the work is committed and pushed with `git push origin main`; then stop for the owner's go-ahead.

Estimated work: about 37 hours in total.

### M0 · The plan in the repo (0.5 h)

Goal: the repo carries this plan and the server phase's rules, and GitHub is up to date.

Build:

- Push the waiting commit `ea574d9` (the frontend guide).
- Replace `CLAUDE.md` with the server phase's version and add this file as `docs/server-plan.md`.
- `.gitignore`: add `claude_conversation.txt`, `server/.env` and `server/data/`. (The conversation file is only excluded locally today, in `.git/info/exclude`.)
- Architecture md: add "## 9. Server build log (CE-2 phase)" after section 8, two lines pointing to this file; add "### Server, CE-2 phase" to the review log with the rows of section 8 below.

Check:

1. `git status` is clean, and `git check-ignore claude_conversation.txt` prints the file name.
2. GitHub shows the guide commit and the plan commit on `main`.

Commit: "Plan the server phase for CE-2"

### M1 · Express skeleton (2 h)

Goal: Express serves the client exactly as `serve` did, plus a health route and the API's error envelope. The mock still runs in the browser.

Build:

- Dependencies: `express@5`, `helmet`, `morgan`, `cookie-parser`, `zod`.
- `config/env.js` (section 5).
- `lib/errors.js`: `ApiError(status, code, message, details)` and helpers (`badRequest`, `unauthenticated`, `forbidden`, `notFound`, `conflict`) with section 4's codes, as the mock's `errors.js` has them.
- `view/http/respond.js`: `ok`, `created`, `accepted`, `noContent`, all in the envelope.
- `middleware/notFound.js`: JSON 404 `NOT_FOUND` for unknown `/api` paths.
- `middleware/errorHandler.js`: `ApiError` to its envelope; the JSON parser's syntax error to 400 `VALIDATION_ERROR`; a body over 100 kb to 413 `PAYLOAD_TOO_LARGE`; anything else to 500 `INTERNAL`, logged with the request line, with no stack in the response.
- `app.js`, in this order: `helmet()`, `morgan('dev')`, `express.json({ limit: '100kb' })`, `cookie-parser`, the `/api/v1` router with `GET /health`, `notFound` for `/api`, `express.static('client')` with `Cache-Control: no-cache`, the `index.html` fallback for any other GET (the rule `client/serve.json` had; Express 5 writes the wildcard as `/{*splat}`), `errorHandler` last.
- `server.js`: `http.createServer(app).listen(PORT)`.
- Scripts: `dev` = `node --watch server/src/server.js`, `start` = `node server/src/server.js`.
- `server/.env.example`, and `server/README.md` with how to run.

CHO: Express setup; middleware (built-in, third-party, custom); request and response; body parsing; error-handling middleware; status codes; the HTTP module.

Check:

1. `npm run dev`, then http://localhost:5173: Home, Markets, a sign-in and a limit order work as before.
2. `GET /api/v1/health` returns 200 with `{ success: true, data: { status: "ok", … } }`.
3. `GET /api/v1/nope` returns 404 `NOT_FOUND`; a POST to `/api/v1/health` with `Content-Type: application/json` and the body `{bad` returns 400 `VALIDATION_ERROR` (Postman).
4. A deep link such as http://localhost:5173/trade/BTC-USDT loads the page, not a 404.
5. `npm run checks` passes (the harness still starts `serve` until M2).

Viva: what middleware is and the order it runs in; why the error handler comes last; what each status code means.

Commit: "Serve the client and a health route from Express"

### M2 · The API on the server (8 h)

Goal: every request the client makes goes over HTTP to Express, live events arrive over Socket.IO, and the behaviour checks pass against the server. Data is kept in the JSON store.

Part A, the move (`git mv`, so history follows the files):

| From `client/src/models/api/mock/` | To `server/src/` | Change |
| --- | --- | --- |
| `db.js` | `model/store.js` | Seeds with `fs` from `client/src/models/data` (same time shift); saves to `STORE_FILE` 200 ms after the last change (write a temp file, then rename) and on SIGINT and SIGTERM; no `localStorage`, no `pagehide` |
| `engine.js`, `market.js`, `wallet.js`, `bus.js`, `text.js` | `model/exchange/` | Import paths only; `../../domain/*` becomes `client/src/models/domain/*` |
| `session.js` | `model/exchange/session.js` | The refresh stand-in becomes a real httpOnly cookie `rt` with a random token (`crypto.randomBytes`) mapped to the session, read and set through `ctx.cookies`; the device from the `User-Agent` header; the IP from `req.ip` |
| `routes/*.js` | `presenter/handlers/*.js` | Import paths only |
| `mappers.js` | `presenter/mappers.js` | None |
| `errors.js` | merged into `lib/errors.js` | `MockError` becomes `ApiError` |
| `util.js` | `lib/util.js` | None |
| `server.js` | `view/routes/index.js`, `view/sockets/gateway.js`, `presenter/handlers/demo.js`; start-up in `server.js` | Split by job |

The cookie can't wait for M6: a stand-in kept in one place on a server would sign every visitor in as whoever logged in last.

Part B, the adapter (`view/routes/index.js`):

- For each `[method, path, handler]`, register `router[method.toLowerCase()](path, …)`. The Express handler builds the context the mock built: `{ method, path, params, query, body, headers, cookies: { get, set, clear }, ip, user, session }`, calls the handler, and answers its `{ status, data }` through `respond.js`. Thrown `ApiError`s reach `errorHandler` on their own.
- The mock's latency stays only behind `DEMO_LATENCY`.
- Demo routes from `handlers/demo.js`, mounted only with `DEMO_CONTROLS=true`: `POST /demo/reset`, `POST /demo/fail-next` (the next API request answers 503). With `TEST_ROUTES=true` as well: `POST /demo/kyc-status` and a read-only `GET /demo/db` snapshot for the checks.
- `POST /kyc`: Multer (memory storage) so the FormData the client sends still arrives; the adapter passes each file to the handler as `{ name, type, size }`, the shape it read from a browser `File`. Limits and saving come in M8.

Part C, Socket.IO:

- Server: `socket.io@4` on the same HTTP server, `transports: ['websocket']`. The handshake reads `auth.token`; a valid token joins `user:<id>`. `join` and `leave` accept only the public rooms (the mock gateway's regular expression). Relay: a tap in `bus.js` sends every `publish(channel, event, payload)` to `io.to(channel).emit(event, payload)`.
- Client: `scripts/copy-vendor.mjs` copies `socket.io-client/dist/socket.io.esm.min.js` into `client/assets/vendor/`. `socket.js` keeps its interface (`connect`, `subscribe`, `on`, `status`, the `reconnect` event, `simulateDrop`) and wraps a Socket.IO client: it joins its rooms again on every connect, since rooms don't survive a reconnection, and dispatches `reconnect` after one.
- If Helmet's content security policy blocks the socket in a browser, allow `ws:` and `wss:` in `connect-src` and log it.

Part D, the client and the checks:

- `http.js`: `TRANSPORT = fetchTransport`. The navbar presenter's demo controls call the demo routes through a new `models/api/demo.api.js`. Nothing in `client/` imports the mock any more.
- `scripts/checks/harness.mjs` starts `node server/src/server.js` on a free port with its own temporary `STORE_FILE`, `DEMO_CONTROLS`, `TEST_ROUTES` and `DEMO_LATENCY` on. `signIn` resets through `/demo/reset` and logs in with `fetch` inside the page, so the `rt` cookie lands in the browser; its `kyc` option uses `/demo/kyc-status`.
- Nine check files read the mock's database or call it in the page: `admin-kyc`, `admin-markets`, `admin-user-detail`, `admin-withdrawals`, `fees`, `orders`, `security`, `verification` and `wallet`. They switch to the API, `/demo/db` and `/demo/fail-next`. `mock.check.mjs` calls the API with `fetch` and becomes the first API test file.
- `scripts/screenshots.mjs` and `scripts/compare.mjs` start the same server. Remove `serve` once nothing uses it.

CHO: routing, route parameters, query parameters, REST API design, CRUD endpoints, custom middleware, file upload with Multer, modules.

Check:

1. Two browsers, one private: the demo trader in one and the admin in the other each see their own account. A limit buy placed by the trader appears in the admin's order book live.
2. DevTools: API calls go to `/api/v1` over HTTP, and one WebSocket is open to `/socket.io`.
3. Stop and start the server: the order is still there (`STORE_FILE`).
4. `npm run checks` passes in every file; write the new total in the log (`mock.check.mjs` changes size). `npm run check:data` passes.
5. A search of `client/` for `api/mock` finds nothing.

Viva: how one request travels (`request()`, `fetch`, Express router, adapter, handler, store, envelope); how Socket.IO rooms work; why the refresh cookie had to become real.

Commit: "Move the API to Express and the live events to Socket.IO"

### M3 · MongoDB, models and the seed (4 h)

Goal: a MongoDB database with the six collections, filled by a seed script through Mongoose models with validation and indexes. The app still runs on the JSON store.

Build:

- Atlas and the local fallback (section 5).
- `config/db.js`: `mongoose.connect(MONGO_URI)`, logs connected, disconnected and errors. `/health` reports Mongo as up or down.
- `model/schemas/`: User, Session, Wallet, LedgerEntry, Order, Trade. Field names follow the records the API already returns (the seed files show them, e.g. the ledger's `time`, the order's `avgPrice`); types, enums, references and indexes follow section 3. Fields the API doesn't use yet (the order's `locked`, `source`, `expireAt`) wait.
  - Types: ObjectId references (`userId` to User, `orderId` to Order), Decimal128 for amounts with a getter to string, Date for times, enums for role, status, side, type, timeInForce, ledger type and refType.
  - Validation: `required`, `enum`, `match` for the email, length 2 to 40 for the display name, and custom validators (amounts not negative, quantity above zero, `filledQuantity` not above `quantity`).
  - Indexes: users `{ email }` unique; sessions `{ userId }` and `expiresAt` TTL; wallets `{ userId, asset }` unique; ledger `{ userId, asset, time: -1 }` and `{ refType, refId }`; orders `{ userId, status, createdAt: -1 }`, `{ market, status, createdAt: 1 }` and `{ userId, clientOrderId }` unique; trades `{ userId, time: -1 }`, `{ orderId }` and `{ tradeId, orderId }` unique.
  - Virtuals: `Wallet.total`; `Order.remainingQuantity` and `isOpen`; `User.isLocked`; an `Order.fills` virtual (ref Trade, local `_id`, foreign `orderId`) for virtual populate in M7.
  - Statics: `User.findByEmail(email)`, `Order.findOpen(userId, market)`, `LedgerEntry.balanceFor(userId, asset)` (an aggregation).
  - Embedding and referencing: preferences, two-factor settings and the watchlist (at most 50 symbols) are embedded in the user, because they are small, bounded and read with it. Wallets, ledger entries, orders and trades are separate collections referenced by id, because they grow without limit and are queried on their own.
- `presenter/mappers.js`: `toDocument(collection, record)` and `toRecord(collection, doc)` between the working set's shape (hex ids, decimal strings, ISO times) and documents.
- `scripts/seed.js` (`npm run seed`): the same seed and time shift as the store; `deleteMany` then `insertMany` through the models, so validation runs; writes the JSON store for the other collections; hashes the demo passwords and the 2FA code into `passwordHash` (`select: false`) and `twoFactor.codeHash`; gives seeded sessions `expiresAt` 7 days after `lastUsedAt`; prints the database name and the counts, and asks for `--yes` before wiping a non-local database.
- `scripts/check-ledger.js` (`npm run db:check-ledger`): an aggregation (`$match`, `$group` with `$sum` of `deltaAvailable` and `deltaLocked`) per user and asset, compared with the wallets; exits 1 on any difference.

CHO: MongoDB setup, Atlas, Mongoose setup, schemas, models, validation, indexing, compound indexes, virtuals, static methods, relationships, referencing versus embedding, aggregation, CRUD (insert and delete).

Check:

1. `npm run seed` against Atlas and against the local database prints 56 users, 4 sessions, 59 wallets, 105 ledger entries, 25 orders and 4 trades.
2. In Compass, each collection lists its indexes, and the demo user has a `$2` hash and no plain password.
3. `npm run db:check-ledger` reports every wallet in step with its ledger.
4. A short script that saves an order with a negative quantity and the side `"hold"` gets a `ValidationError` naming both paths.
5. `npm run checks` passes (nothing uses MongoDB yet).

Viva: schema versus model; why Decimal128; which index serves which query; what a virtual is; embedding versus referencing for each collection.

Commit: "Add the MongoDB models and the seed script"

### M4 · The store on MongoDB (4 h)

Goal: the six collections live in MongoDB. The server loads them at start, and every change reaches MongoDB before the request that made it is answered.

Build:

- `store.open()`: connect; load the six collections (`find().lean()` and `toRecord`) into the working set; the other collections from `STORE_FILE`; seed an empty database first when `SEED_ON_START=true`. Exit with a clear message if MongoDB can't be reached.
- `store.flush()`: for each of the six collections, compare every record with its last flushed copy (keyed by `id`; wallets by `userId` and `asset`; trades by `tradeId` and `orderId`) and send one `bulkWrite` of `updateOne(key, { $set: toDocument(record) }, { upsert: true })`; then save the JSON file. Flushes run one at a time. `$set` keeps fields the working set doesn't hold, such as `passwordHash`, so never `replaceOne`. A failed flush keeps its changes pending, retries on the next flush, and shows on `/health`.
- `store.persist()` schedules a flush 200 ms later (the simulator's and the engine's background changes). The adapter awaits `store.flush()` after every request that isn't a GET, before answering.
- `store.remember(collection, record)`: after a direct Mongoose write (from M5), updates the working set and its flushed copy, so nothing is written twice.
- The watchlist moves from the JSON store into `user.watchlist`, as section 3 has it; the three watchlist handlers follow.
- Checks: `mongodb-memory-server` (dev dependency). The harness starts one in-memory MongoDB per check file and passes its URI with `SEED_ON_START=true`.

CHO: CRUD (update and upsert), Mongoose queries, performance (bulk writes, `lean`), error handling.

Check:

1. Place an order in the browser. Within a second Compass shows the order, the wallet change and the ledger entries.
2. Restart the server: the order and the balances come back from MongoDB.
3. After a few trades, `npm run db:check-ledger` still reports every wallet in step.
4. `npm run checks` passes, each file on its own in-memory database.

Viva: why the engine keeps a working copy in memory; what happens between the engine's change and MongoDB; why `$set` and not a replace.

Commit: "Keep users, sessions, wallets, ledger, orders and trades in MongoDB"

### M5 · Sign-in on MongoDB with bcrypt (3 h)

Goal: register, log in and change the password with Mongoose queries and bcrypt. No plain password is left anywhere.

Build:

- User model: a `password` virtual whose setter keeps the plain text on the document for one save; `pre('save')` middleware hashes it into `passwordHash` with `BCRYPT_ROUNDS`; an instance method `comparePassword(plain)`. Use async middleware functions.
- Error-handling middleware on save: a duplicate key (E11000) on `email` becomes `ApiError` 409 `CONFLICT` with `details: { email: "taken" }`.
- `model/services/auth.service.js`:
  - register: `User.create`, then `remember`, the demo credit through the wallet, the welcome notification;
  - login: `User.findByEmail` with `+passwordHash`, `isLocked`, `comparePassword`, then `failedLoginCount` and `lockUntil` on the user (5 wrong passwords lock sign-in for 15 minutes: 423 `ACCOUNT_LOCKED`);
  - the 2FA step: the ticket as before, the code compared with `twoFactor.codeHash`.
- `handlers/auth.js` calls the service. In `handlers/users.js`, the password change and switching 2FA on or off use `User.findById` and `save()`.
- Delete the `credentials` and `lockouts` maps from the JSON store.

CHO: Mongoose middleware, instance and static methods, queries (`findOne`, `findById`, `select`), validation, custom errors, password hashing.

Check (Postman):

1. Register: 201 and a 10,000 USDT wallet; the same email again: 409 `CONFLICT`.
2. Five wrong passwords: four 401s, then 423 with `lockUntil`.
3. The demo login returns `requires2fa`; the code step returns 200 and a token.
4. In Compass the new user has a `$2` hash and no password field.
5. Security page: change the password, log out, log in with the new one.
6. `npm run checks` passes.

Viva: what the salt and the cost in bcrypt do; why a hash is compared and never decrypted; where Mongoose middleware runs; how a duplicate email becomes a 409.

Commit: "Sign in against MongoDB with bcrypt"

### M6 · Tokens and protected routes (4 h)

Goal: JWT access tokens, the rotating refresh cookie, and route protection as Express middleware.

Build:

- `model/services/token.service.js`, following section 4:
  - an access JWT `{ sub, role, sid }` signed with `JWT_ACCESS_SECRET` for `ACCESS_TOKEN_TTL`;
  - a refresh JWT `{ sid, ver }` signed with `JWT_REFRESH_SECRET`, in the `rt` cookie (httpOnly, SameSite=Strict, path `/api/v1/auth`, Secure in production, 7 days);
  - `POST /auth/refresh` increments the session's `tokenVersion` and sets `rotatedAt`. A token one version behind within 30 s of the rotation gets the current one; anything older revokes the session.
- `middleware/authenticate.js` runs on every `/api/v1` request and sets `req.user` and `req.session` when the Bearer token is valid and its session isn't revoked. On public routes (markets, assets) a missing or expired token just means a guest, as in the mock.
- `middleware/requireAuth.js` on `/users`, `/orders`, `/trades`, `/wallet`, `/kyc` and `/notifications` answers 401 `UNAUTHENTICATED` when there is no valid user; the client then refreshes once and retries. `middleware/authorize.js` (`requireAdmin`) on `/admin` reads the role and status again from MongoDB, so a role change applies at once.
- Authenticated responses send `Cache-Control: no-store`.
- The Socket.IO handshake checks the same access JWT.
- Remove the mock's token maps and the M2 cookie map.

CHO: authentication basics, JWT, auth middleware, protected routes, role-based access, cookies.

Check (Postman, with `ACCESS_TOKEN_TTL=1m` for item 2):

1. `GET /users/me`: 401 without a token, 200 with the trader's. `GET /admin/stats`: 403 with the trader's token, 200 with the admin's.
2. After a minute the access token gets 401; `POST /auth/refresh` with the cookie returns a new one.
3. Two refreshes within 30 s both succeed; the old cookie replayed after 30 s gets 401, and the session shows as ended on the Security page.
4. The admin makes the trader an admin: the trader's existing token now reaches `/admin/stats`. The admin freezes the trader: the trader can still sign in and look, but an order gets 403 `FORBIDDEN`.
5. In the browser, a reload keeps you signed in, and logging out ends the session.
6. `npm run checks` passes.

Viva: what a JWT holds and who can read it; why the access token stays in memory and the refresh token in an httpOnly cookie; rotation and reuse detection.

Commit: "Protect the API with JWT and a rotating refresh cookie"

### M7 · Orders and trades from MongoDB (3 h)

Goal: the order and trade reads are Mongoose queries that use the compound indexes.

Build:

- `model/services/order.queries.js`:
  - `list(userId, { state, market, side, cursor, limit })`: `Order.find({ userId, status: { $in: … }, … })`, sorted `{ createdAt: -1, _id: -1 }`, `limit + 1`, `lean()`. A keyset cursor (`createdAt` and `_id`, base64url) replaces the mock's offset; the client already treats `nextCursor` as opaque.
  - `detail(userId, id)`: `Order.findOne({ _id: id, userId }).populate('fills')` (the virtual from M3, sorted by time), plus `LedgerEntry.find` for the order's and its trades' entries, sorted by time.
  - `trades(userId, filters)`: `Trade.find` with the same cursor.
  - A malformed id answers 404 `NOT_FOUND`, as does another user's order.
- The GET handlers for `/orders`, `/orders/:id` and `/trades` call these after `await store.flush()`, and map with the same mappers, so the responses keep their shape. Placing and cancelling stay in the engine.
- `scripts/explain.js` (`npm run db:explain`): `explain('executionStats')` for the three queries, showing an IXSCAN on the compound index and keys and documents examined against returned; and the order query again with `hint({ $natural: 1 })`, to show the COLLSCAN the index replaces.

CHO: queries, find, filters, sorting, pagination, populate, indexing, performance, compound indexes.

Check:

1. Orders page: Open, History and Trades show the same rows as before. After 30 more orders (a Postman runner loop), "Load more" pages through History with no gaps or repeats.
2. The order drawer shows the same fills and ledger lines as before.
3. `npm run db:explain`: IXSCAN for all three queries, and documents examined equal to documents returned.
4. `GET /orders/abc` and another user's order id both answer 404.
5. `npm run checks` passes.

Viva: how the cursor works and why it beats an offset; what populate does (a second query with `$in`); reading an explain plan.

Commit: "Read orders and trades with Mongoose queries"

### M8 · Validation, uploads and errors (3 h)

Goal: every input is checked before it reaches a handler, KYC images are real uploads, and every database or upload error becomes a clear 4xx.

Build:

- `presenter/validators/`: Zod schemas for auth (register, login, the 2FA step), orders (market, side, type, timeInForce, decimal strings for price, quantity and quoteQuantity; a limit order needs a price), wallet (deposits, withdrawals), KYC, users (profile, password), and list query strings (`limit` 1 to 100, `cursor`, `state`, `market`, `side`).
- `middleware/validate.js`: `validate({ body, query, params })` answers 400 `VALIDATION_ERROR` with one detail per field, and puts the parsed values on `req.input`, which the adapter hands to the handler. Sanitising: trimmed strings, lower-case emails, unknown keys dropped.
- `middleware/upload.js`: Multer memory storage, JPEG or PNG, 5 MB per file; the handler saves accepted files under `server/data/uploads/kyc/<userId>/`. `GET /admin/kyc/:id/document` streams the saved image to admins (`fs.createReadStream`), or the placeholder when there is none.
- `errorHandler` maps: `ApiError`; Zod errors to 400; a Mongoose `ValidationError` to 400 with its paths; a `CastError` to 404; E11000 to 409; Multer's `LIMIT_FILE_SIZE` and a body over 100 kb to 413 `PAYLOAD_TOO_LARGE`; a JSON syntax error to 400; anything else to 500 `INTERNAL`.

CHO: validation, sanitisation, validation libraries, file upload, Multer, error-handling middleware, custom errors, streams.

Check (Postman):

1. `POST /orders` with a limit order without a price, a negative quantity and an unknown market: 400, one detail per field. A price off the tick size: 422 `MARKET_RULES`, from the engine as before.
2. `POST /kyc` with a 6 MB image: 413; with a PDF: 400; with a valid JPEG: 201, and the file is on disk. The admin opens the application and sees the image.
3. `GET /orders?limit=500`: 400.
4. `npm run checks` passes.

Viva: why the server validates when the client already did; what Multer does with a multipart body; why a duplicate key is a 409 and a bad id a 404.

Commit: "Validate input with Zod and upload KYC images with Multer"

### M9 · Postman collection and the full test run (3 h)

Goal: a Postman collection that tests the API from the command line, and a clean run of every check.

Build:

- `docs/postman/crypto-exchange.postman_collection.json` and `local.postman_environment.json` (`baseUrl`; the login requests' scripts save the tokens).
- Folders: Health; Auth (register, login, the 2FA step, refresh, logout, lockout); Markets; Orders (place, list, detail, cancel, cancel all); Wallet (balances, ledger, deposit, withdrawal); KYC (multipart); Admin (stats, users, freeze, a KYC decision, a withdrawal decision, halting a market); Errors (400, 401, 403, 404, 409, 413, 422, 423).
- Every request has tests: the status code, the envelope's shape, the fields that matter. The collection runs top to bottom on a freshly seeded database.
- `npm run test:api`: Newman runs the collection against http://localhost:5173.

CHO: testing APIs with Postman.

Check:

1. Postman's Collection Runner: every test passes. Keep a screenshot for section 7.3 of the report.
2. `npm run test:api`: 0 failures.
3. `npm run checks`, `npm run check:data` and `npm run db:check-ledger` pass; write the totals in the log.

Viva: what a Postman test asserts; how the environment carries the token from one request to the next.

Commit: "Add the Postman collection and run it with Newman"

### M10 · Documents and the CE-2 tag (3 h)

Goal: everything written about the server matches what runs.

Build:

- `docs/backend-guide.md`, complete: two traces (logging in; placing a limit buy through to its ledger entries), every server file and its main functions, the CHO map in section 7, and a glossary.
- `README.md` and `server/README.md`: Node 22, MongoDB, `server/.env`, `npm run seed`, `npm run dev`, the demo accounts and every script.
- The architecture md: the section 9 pointer up to date, and a review-log row for anything that changed during the build.
- The CE-2 report and slide deck are built outside the repo. Regenerate them from the final state: report chapters 3.3, 4, 6, 7, 8 and 10; slides System Architecture, The Mock Backend (now the Express server) and Testing and Quality.
- `git tag ce2` and push the tag.

Check: a teammate clones the repo on another laptop, follows only the README, and places a trade within 10 minutes.

Commit: "Document the CE-2 server"

## 7. CHO coverage

Where each course topic shows up in Orichal. Units 4 and 5 are the ones this phase builds; unit 2 is what the server rests on.

| Unit | Topic | Where |
| --- | --- | --- |
| 2 | HTTP module, creating a server | `server.js`: `http.createServer(app)`, shared with Socket.IO (M1, M2) |
| 2 | File system, path | `store.js` and `seed.js` read the seed files and write the JSON store (M2, M3) |
| 2 | Streams | The KYC document streamed to admins (M8) |
| 2 | Events | `bus.js` publish and listen, relayed to Socket.IO (M2) |
| 2 | Modules, npm, package.json, scripts | ES modules throughout; the root `package.json` scripts |
| 4 | Express setup, middleware, custom middleware | `app.js`; `notFound`, `errorHandler` (M1); `authenticate`, `requireAuth`, `authorize` (M6); `validate`, `upload` (M8) |
| 4 | Routing, route params, query params | The adapter mounting 61 routes (M2); filters and cursors (M7) |
| 4 | Request and response, body parsing | `express.json`, `cookie-parser`, the envelope (M1, M2) |
| 4 | REST API design, CRUD endpoints, status codes | `/api/v1` resources; orders create, read, cancel; section 4's codes |
| 4 | Error-handling middleware, custom errors | `ApiError`, `errorHandler` (M1, M8) |
| 4 | Validation, sanitisation, validation libraries | Zod validators and `validate` (M8) |
| 4 | Authentication basics, password hashing | bcrypt in Mongoose middleware (M5) |
| 4 | JWT, auth middleware, protected routes, role-based access | `token.service`, `authenticate`, `requireAuth`, `authorize` (M6) |
| 4 | File upload, Multer | KYC images (M2, M8) |
| 4 | Cloud storage introduction | Not in CE-2: Cloudinary replaces the upload folder for the final evaluation |
| 4 | Testing APIs with Postman | The collection and Newman (M9) |
| 5 | MongoDB setup, Atlas | Atlas cluster and local fallback (M3) |
| 5 | CRUD operations | Insert (seed, register), read (queries), update and upsert (flush, `save`), delete (seed, the sessions TTL index) |
| 5 | Mongoose setup, schemas, models, validation | `config/db.js` and six models (M3) |
| 5 | Queries, find, populate | Auth (M5); orders and trades, virtual populate of fills (M7) |
| 5 | Aggregation | `LedgerEntry.balanceFor` and `db:check-ledger` (M3) |
| 5 | Indexing, compound indexes, performance | Section 3's indexes (M3); `db:explain`, `lean`, bulk writes (M4, M7) |
| 5 | Mongoose middleware | Password hashing on save, the duplicate-key handler (M5) |
| 5 | Virtuals | `Wallet.total`, `Order.remainingQuantity`, `User.isLocked`, `Order.fills` (M3) |
| 5 | Static methods | `User.findByEmail`, `Order.findOpen`, `LedgerEntry.balanceFor` (M3) |
| 5 | Relationships, referencing versus embedding | Referenced wallets, ledger, orders, trades; embedded preferences, 2FA, watchlist (M3, M4) |
| 5 | Error handling, custom errors, validation | Mongoose errors mapped to 400, 404 and 409 (M5, M8) |

## 8. Departures from the architecture declaration

Copy these rows into the review log under "### Server, CE-2 phase" (M0), and add a row for anything else that changes during the build.

| Type | Section | What changed | Why |
| --- | --- | --- | --- |
| Change | 1 Folders, Overview | The server is ES modules, not CommonJS, with one `package.json` at the root | It reuses the client's domain rules and the mock's modules, which are ES modules; one install for everything |
| Change | Overview, 1 Folders | Express serves the client and the API on port 5173 from one origin; no Vite and no proxy | The client is still the static phase's plain modules; one origin keeps `rt` first-party with no CORS |
| Change | 1 Folders, 6 MVP | The engine and the market simulator run inside the API process on an in-process bus: no Redis Streams or Pub/Sub, no leader lock, no engine process | CE-2 scope; section 1's inline engine mode |
| Change | 3 Schemas | Users, sessions, wallets, ledger entries, orders and trades are in MongoDB; the other collections stay in `server/data/store.json` | CE-2 scope; the rest move for the final evaluation |
| Change | 3 Schemas, 6 Flows | The engine works on an in-memory copy, and changes reach MongoDB in bulk writes before the request that made them is answered (200 ms for background changes); no multi-document transactions yet | The core is synchronous code over arrays; transactions come with the service rewrite |
| Change | 3 Schemas (trades) | One trade document per side of a fill, linked by `tradeId`, instead of one per match | Most fills meet the bot's anonymous ladder, which has no order document |
| Change | 3 Schemas | Field names follow the API's records (the ledger's `time`, the order's `avgPrice` and `appliedAt`); fields the API doesn't use yet (the order's `locked`, `source`, `expireAt`) wait | The DTOs stay unchanged |
| Change | 3 Schemas (users) | 2FA keeps the demo's fixed code, stored as a bcrypt hash in `twoFactor.codeHash` | TOTP comes later |
| Change | 1 Folders | bcryptjs instead of bcrypt | Pure JavaScript, no native build on Windows |
| Change | 1 Folders | morgan request logs instead of pino; no metrics | morgan is the course's logger; metrics come with Prometheus |
| Change | 1 Folders, 4 API | KYC images are saved under `server/data/uploads` instead of Cloudinary | Cloud storage comes later |
| Change | 4 API | No rate limits yet | They need Redis |
| Addition | 4 API | Demo routes under `/api/v1/demo`: reset and fail-next for the Simulator menu; kyc-status, email-verified and a read-only snapshot for the checks only | The Simulator menu and the checks used to reach into the mock directly |
| Change | 3 Schemas | `createdAt` and `updatedAt` are fields the code sets instead of Mongoose timestamps; `users` also stores `hasPassword` and `googleLinked`, and `sessions` the device name; only the indexes this phase's queries use exist (added in M3) | The API's times are the engine's own, to the millisecond; the records already carry those fields |
| Change | 4 API (Health) | One `GET /api/v1/health` (`status`, `uptimeSeconds`, `time`; MongoDB's state from M3) instead of `/health/live`, `/health/ready` and `/metrics` outside `/api/v1` (added in M1) | No Docker, Nginx or Prometheus probes the server in this phase; one public route under the API's base path serves Postman and the demo |

## 9. Viva ownership

Each of you owns one area: builds or reviews its milestones, writes its part of `docs/backend-guide.md`, and answers for it in the viva. Read the others' parts too.

| Area | Milestones | Owner |
| --- | --- | --- |
| Express server, the adapter, Socket.IO | M1, M2 | |
| MongoDB: models, seed, store, queries, indexes | M3, M4, M7 | |
| Authentication and security: bcrypt, JWT, cookies, middleware, roles | M5, M6 | |
| Validation, uploads, errors, Postman, documents | M8, M9, M10 | |

## 10. The CE-2 demo (about 5 minutes)

1. Terminal: `npm run dev`. The log shows MongoDB connected and the server listening on http://localhost:5173.
2. Postman: health; admin login and `GET /admin/stats` (200); the trader's token on the same route (403); no token (401); a duplicate registration (409); a bad order (400) and an off-tick price (422).
3. Two browsers: the trader logs in with the 2FA code and places a limit buy; the admin, in a private window, sees the book move and finds the order on the trader's admin page.
4. Compass: the new order document and its ledger entries. Then `npm run db:check-ledger` and `npm run db:explain`.
5. Code: one request from its route through the middleware and the handler to the model.

## 11. If the slot is 25 or 26 November

Aim for M0 to M5: Express, the API and live events on the server, MongoDB with the six collections, and sign-in with bcrypt and real queries. Present M6 to M10 as the plan, with this file as the evidence. Don't start a milestone you can't finish and push before the slot; a working M5 is worth more than a half-built M6.

## 12. Checklist

M0 · The plan in the repo

- [x] The frontend guide commit pushed
- [x] `CLAUDE.md` for the server phase; this plan in `docs/`
- [x] `.gitignore`: `claude_conversation.txt`, `server/.env`, `server/data/`
- [x] Architecture md: section 9 pointer; review-log table "Server, CE-2 phase"

M1 · Express skeleton

- [x] `env.js`, `errors.js`, `respond.js`, `notFound`, `errorHandler`
- [x] `app.js`, `server.js`, `GET /health`, static client and fallback
- [x] `npm run dev` and `start`; `.env.example`; `server/README.md`

M2 · The API on the server

- [x] Core moved to `server/src`; the store on `fs`; the real `rt` cookie
- [x] The adapter mounts all 61 routes; demo routes; Multer on `POST /kyc`
- [x] Socket.IO gateway and relay; `socket.js` on the vendored client
- [x] `http.js` on `fetchTransport`; demo controls on the API; no mock imports left in `client/`
- [x] Harness, nine check files, `mock.check`, screenshots and compare on the server

M3 · MongoDB, models and the seed

- [x] Atlas and the local fallback; `config/db.js`; Mongo on `/health` (the owner's call on 24 Nov: Atlas only, no local MongoDB)
- [x] Six models: validation, indexes, virtuals, statics
- [x] Mappers between documents and records (`model/documents.js`)
- [x] `seed.js`, `check-ledger.js`

M4 · The store on MongoDB

- [x] Load at start, flush with `$set` bulk writes, `remember`
- [x] The adapter awaits the flush on writes
- [x] The watchlist embedded in the user
- [x] Checks on `mongodb-memory-server`

M5 · Sign-in on MongoDB with bcrypt

- [x] `password` virtual, hashing middleware, `comparePassword`, `findByEmail`
- [x] E11000 to 409
- [x] `auth.service` on Mongoose; password change and 2FA on the user document
- [x] `credentials` and `lockouts` maps removed
- [x] One session per login (the owner's decision, 24 Nov): M6's rotation and reuse detection depend on it

M6 · Tokens and protected routes

- [ ] `token.service`: access JWT, refresh JWT with rotation, the 30 s grace and reuse detection
- [ ] `authenticate`, `requireAuth`, `authorize` on the route groups
- [ ] Socket.IO handshake on the JWT; `Cache-Control: no-store`

M7 · Orders and trades from MongoDB

- [ ] `order.queries.js`: list, detail with populate, trades; keyset cursor
- [ ] Handlers on the queries; bad and foreign ids answer 404
- [ ] `explain.js`

M8 · Validation, uploads and errors

- [ ] Zod validators, `validate`, sanitising
- [ ] `upload`; KYC files on disk; the admin document stream
- [ ] `errorHandler` maps Zod, Mongoose, Multer and parser errors

M9 · Postman and the full test run

- [ ] Collection and environment with tests
- [ ] `test:api` with Newman; the full check run recorded

M10 · Documents and the tag

- [ ] `backend-guide.md` complete; both READMEs
- [ ] The md's review log up to date
- [ ] Report and slides regenerated
- [ ] Tag `ce2` pushed

## 13. Log

- **22 Nov 2026 · Plan.** Checked the starting point in the GitHub repo and the local copy: `main` at `3576717`, `ea574d9` not pushed, `server/` holding only its README. Ran the mock backend in Node 22 with three browser features replaced; its handlers, engine and simulator worked unchanged. Wrote this plan and the server phase's `CLAUDE.md`. Scope agreed with the owner: up to MongoDB with Mongoose, with auth and orders on real queries and the other collections in a JSON file until the final evaluation.
- **22 Nov 2026 · M0, the plan in the repo.** What: GitHub brought up to date and the phase's rules, plan and ignore rules committed. Files and how:
  - `ea574d9` (the frontend guide) pushed on its own first: `origin/main` moved from `3576717` to `ea574d9`.
  - `CLAUDE.md` (server phase) and this plan committed as the owner wrote them; only this checklist and this entry changed here.
  - `.gitignore`: `server/.env`, `server/data/` and `claude_conversation.txt`, each with a comment. `git check-ignore -v` names `.gitignore` for all three (the conversation file now through the committed rule, not only `.git/info/exclude`) and leaves `server/.env.example` and `server/README.md` tracked. `git log --all` finds none of the three paths in any commit, so nothing needed `git rm --cached`.
  - Architecture md: "## 9. Server build log (CE-2 phase)" after section 8, two lines pointing here; "### Server, CE-2 phase" at the end of the review log with the 13 rows of section 8, checked by a script against this file's table character for character. Three small additions keep the md consistent: a row for section 9 itself (as the static phase's table has one for section 8), a pointer to section 9 in the opening paragraph beside sections 7 and 8, and the review-log intro reworded, since its "last table" is now the server's. Sections 1 to 7 untouched.
  - `docs/backend-guide.md` started: the M0 section (where the rules live, why each path is ignored, the departures in three groups, how to check M0, viva questions). Its 7 links resolve.

  Departures from the plan: none beyond those three additions to the md.
- **23 Nov 2026 · M1, the Express skeleton.** What: Express 5 serves the client in place of `serve`, with `GET /api/v1/health`, the envelope and the error handler; the client still answers its API calls with the in-browser mock. Files and how:
  - `package.json`: express 5.3.0, helmet 8.3.0, morgan 1.12.1, cookie-parser 1.4.7 and zod 4.6.7; `dev` is `node --watch server/src/server.js`, `start` the same without watching; `engines` asks for Node 22 or later (the owner's laptop runs 24.22.2, which works too). `serve` stays until M2, because the harness, `screenshots.mjs` and `compare.mjs` still start it.
  - `config/env.js`: `process.loadEnvFile()` on `server/.env` (a missing file is allowed, and a variable set in the real environment wins over the file; both tested), then one Zod schema for the 14 variables of section 5. Every variable has a default except the JWT secrets, which stay optional until M6 (at least 32 characters, and different from each other, when set). An empty value counts as unset; `STORE_FILE` resolves from the repository root; money (`DEMO_CREDIT_USDT`) stays a string. A bad value prints each variable's name and rule, never its value, and exits 1. `server/.env.example` lists all 14. Checked in four runs: defaults, the example file, six bad values, equal secrets.
  - `lib/errors.js` (`ApiError` and five helpers, as the mock's had them); `view/http/respond.js` (`ok`, `created`, `accepted`, `noContent`, plus `fail`, which only the error handler calls, so the envelope lives in one file); `middleware/notFound.js` (passes `NOT_FOUND` on rather than writing it); `middleware/errorHandler.js`: `ApiError` with its own status; a JSON syntax error 400 `VALIDATION_ERROR`; a body over 100 kb 413 `PAYLOAD_TOO_LARGE`; any other error carrying a 4xx `status` 400 `VALIDATION_ERROR` (the router's broken `%`-escape has `status` 400 but no `expose`); anything else 500 `INTERNAL`, logged with the request line, with no stack in the response and no message in production. Checked on a throwaway app: 12 paths, including a throw in async and in sync code.
  - `view/routes/index.js` (`GET /health`: `status`, `uptimeSeconds`, `time`); `app.js` in this plan's order; `server.js` (`http.createServer(app)`, a clear message when the port is taken). Helmet keeps its defaults except `upgrade-insecure-requests`, which is on only in production, since Safari would ask for https on `http://localhost`. `express.static` sends `Cache-Control: no-cache` and has `redirect: false`, so a folder path such as `/styles` falls through to `index.html` as with `serve`.
  - `server/README.md` (how to run); `README.md` (Node 22, what `npm run dev` does now, `server/`, the phase line); `CLAUDE.md` commands (`npm start`); the M1 section of `docs/backend-guide.md`.

  Checks:
  1. In Chromium through Express: Home, Markets (4 rows), the demo sign-in with its code, a limit buy ("Order placed") and a reload on the deep link all work; 647 responses with 0 console errors, CSP violations, failed requests or 4xx/5xx. The whole behaviour suite also ran against Express, from a scratch copy of `scripts/checks` whose harness started `server/src/server.js`: 466 checks in 22 files pass, with no page errors.
  2. `GET /api/v1/health`: 200 and the envelope.
  3. `GET /api/v1/nope`: 404 `NOT_FOUND` as JSON; a POST with `{bad`: 400 `VALIDATION_ERROR`; a 150 kb body: 413.
  4. `/trade/BTC-USDT`: 200 `text/html`; an unchanged file answers 304 to its `ETag`.
  5. `npm run checks` (still on `serve`): 466 checks in 22 files pass. `npm run check:data`: 3,947 checks on 26 files pass.

  Departures: `GET /api/v1/health` instead of section 4's `/health/live`, `/health/ready` and `/metrics`; a row in section 8 and in the md's review log. The rest stays inside the plan: the 4xx mapping in the error handler, the JWT secrets optional until M6, `fail` in `respond.js`, and Helmet's one directive.
- **23 Nov 2026 · M2, the API on the server.** What: the mock backend moved from `client/src/models/api/mock` to `server/src` with `git mv`; the client talks to it over HTTP and Socket.IO; the checks run against the server. Files and how:
  - Part A, the move, as section 6's table has it. `model/store.js` seeds with `fs` (the same time shift) and saves 200 ms after the last change, through a temporary file and a rename, and at once on SIGINT and SIGTERM. `model/exchange/` (engine, market, wallet, bus, text): import paths, the client's domain rules imported from `client/src/models/domain/`, `MockError` → `ApiError`. Two server fixes: `bus.js` feeds taps instead of per-channel listeners (the gateway is the one tap), and `market.js` keeps one timer per loop (the mock pushed a new handle on every tick, which on a server would grow for as long as it runs).
  - `session.js`: the real `rt` cookie, a random 32-byte token (httpOnly, SameSite=Strict, path `/api/v1/auth`, Secure in production, 7 days from `REFRESH_TOKEN_TTL`, renewed on refresh). The store keeps only its SHA-256 hash, mapped to the session (`refreshTokens`, in the JSON store until M6, so a restart keeps everyone signed in). Access tokens stay random strings in memory until M6. Logout forgets only that session's tokens; the mock cleared them all, which on a server would sign everyone out. The device comes from `User-Agent` and the IP from `req.ip`. To get them there, the session calls take the request context: `audit(ctx, …)`, `startSession(ctx, user)`, `refresh(ctx)`, `endSession(ctx)`, about 25 call sites in the handlers, beyond "import paths only". `lifecycle.js` holds the mock server's start-up and reset.
  - Part B: `view/routes/index.js` mounts the 61 rows (checked: 61, no duplicate method and path), builds the mock's context from `req` and `res`, and answers through `respond.js`. `exchangeReady` waits out a reset and adds the mock's delay when `DEMO_LATENCY` is on. Multer (2.5.0, memory storage) runs on `POST /kyc` and passes each file as `{ name, type, size }`. Demo routes with `DEMO_CONTROLS`; with `TEST_ROUTES`, `kyc-status`, `email-verified` and `GET /demo/db` (`?only=`; it leaves out the plain demo passwords and the cookie hashes). `fail-next` is a short-lived httpOnly cookie, so it fails the next request of the browser that asked: with two browsers in the demo, a shared switch could be used up by the admin's background refresh.
  - Part C: `view/sockets/gateway.js` runs Socket.IO 4.8.4 on the same HTTP server, WebSocket only; the handshake's `auth.token` joins `user:<id>`; `subscribe` and `unsubscribe` with `{ channel }`, as section 4 names them, accept only the mock's public rooms; the relay is one bus tap to `io.to(channel).emit()`. Helmet's policy let the same-origin WebSocket through in Chromium, so `connect-src` is unchanged. `copy-vendor.mjs` vendors `socket.io.esm.min.js` and its map. `socket.js` keeps its interface, joins its rooms again on every connect, dispatches `reconnect` after a drop (not after a deliberate reconnect with a new token), and reconnects when `http.js` refreshes the token, through a new `onAccessTokenRefreshed` hook, as section 4 says.
  - Part D: `http.js` on `fetchTransport`; `demo.api.js`; the navbar's demo controls on it, with error toasts; the mock folder deleted. The harness starts `server.js` per check file with a temporary `STORE_FILE`, `NODE_ENV=test`, `DEMO_CONTROLS`, `TEST_ROUTES` and `DEMO_LATENCY`, and gives `signIn` (reset and login with `fetch` in the page), `snapshot()`, `api()`, `failNext()` and `start({ browser: false })`. The browser's network log of 4xx answers and fail-next's 503 no longer counts as page errors (a 500 still does). The nine check files read `/demo/db` or call the API. `mock.check.mjs` is renamed `api.check.mjs` and calls the API from Node with a cookie jar that keeps each cookie's path: 46 checks (36 before), the new ones on the `rt` cookie, refresh, logout and a 403. `screenshots.mjs` and `compare.mjs` import the harness's `startServer` and `signInPage`. `serve`, its `compression` override and `client/serve.json` are gone; the frontend guide's 56 links to moved files open them on the `frontend-static` branch.
  - Two flaky checks made exact, both inherited from the static phase. The wallet's "held rose by 500.00" now reads the USDT row's held column instead of the card, which values locked BTC at a price that can move while the check waits. The API check's crossing buy now sits 50 USDT over the ask instead of 5, which the simulator's drift or its bot could outrun in the second before the engine applied it; it failed the first full run that way.
  - Docs: the M2 section of `docs/backend-guide.md` (and its M1 lines on morgan), both READMEs, and a note at the top of the frontend guide.

  Checks:
  1. Two Chromium contexts: the trader and the admin each see their own account; the trader's limit buy appeared in the admin's order book about half a second later, without a reload.
  2. Every one of the trader's 24 API calls went to `/api/v1`; exactly one WebSocket is open per page, to `/socket.io/?EIO=4&transport=websocket`; no JavaScript errors or CSP violations. The `rt` cookie is httpOnly, SameSite Strict, path `/api/v1/auth`, and a reload keeps the session.
  3. A server stopped and started on the same `STORE_FILE`: the order came back open and on the book, and the same `rt` cookie still refreshed. The stop was a hard kill, so the 200 ms save had already written it.
  4. `npm run checks`: 476 checks in 22 files pass (466 before; `api` 46 instead of `mock` 36). `npm run check:data`: 3,947 checks on 26 files pass.
  5. A search of `client/` for `api/mock` finds nothing.

  Also run: an API script over HTTP (32 checks: cookies, refresh, logout, 61 routes, Multer, fail-next per browser, reset), a Socket.IO script (12: rooms, refusals, private events, unsubscribe, no long-polling), `npm run shots` and `npm run compare`.

  Departures: morgan logs only `/api` requests (the owner's call, a small change to M1's `morgan('dev')`); the `email-verified` test route, for the `--verified` flag of `screenshots` and `compare`; fail-next kept per browser in a cookie; the session calls with `ctx`; `mock.check.mjs` renamed `api.check.mjs`, since the mock is gone. A new row in section 8 and in the md's review log: a sign-in revives the user's first session, as in the static phase, so the Security page shows its board's devices.
- **24 Nov 2026 · M3, MongoDB, models and the seed.** What: a MongoDB database on Atlas with six Mongoose models, a seed script that fills them through validation, and a ledger check by aggregation. The app still runs on the JSON store. Files and how:
  - `package.json`: mongoose 9.13.0, bcryptjs 3.0.3; `npm run seed`, `npm run db:check-ledger`.
  - `config/db.js`: `mongoose.connect` with a 5 s limit on finding a server; logs connected, disconnected and errors; explains a failure without printing the connection string. `GET /health` gains `mongo: up | down`. In M3 a missing database isn't fatal.
  - `model/schemas/` (User, Session, Wallet, LedgerEntry, Order, Trade, and `fields.js` for money fields and references): types, enums, validators, indexes, virtuals and statics as section 6 lists them. Checked by a script: 26 cases without a database.
  - `lib/decimal.js`: decimal strings to Decimal128 and back. Decimal128 prints small amounts with an exponent (`0.00000000` as `0E-8`), which `money.js` doesn't read, so they are written out again: 20,014 amounts there and back, none changed.
  - `model/documents.js`: `toDocument`, `toRecord` and the dotted paths for `$set`, from one table per collection. All 253 seeded records go to documents and back with no field changed, and all validate.
  - `model/seed.js` (the seed moved out of `store.js`) and `server/scripts/seed.js`; the demo passwords and the 2FA code go in as bcrypt hashes. Ledger entries of one instant get ids in writing order, and `newId()` makes real ObjectIds, so `(time, _id)` sorts the ledger as it was written; the mock's ids were not in order.
  - `server/scripts/check-ledger.js`. The harness always sets `MONGO_URI`, so the checks can never reach the database in `server/.env`.

  Checks:
  1. `npm run seed` on Atlas: 56 users, 4 sessions, 59 wallets, 105 ledger entries, 25 orders, 4 trades. Without `--yes` it refuses to wipe them and exits 1. (Atlas only, by the owner's decision: no local MongoDB.)
  2. From a script instead of Compass: the 13 indexes exist in Atlas beside `_id`; the demo user has `$2b$12$` hashes, no plain password, and a second account with the same email gets E11000.
  3. `npm run db:check-ledger`: all 59 wallets of 54 people equal the sums of their 105 entries.
  4. An order with a negative quantity and the side `hold`: a `ValidationError` naming `quantity` and `side`.
  5. `npm run checks`: 476 in 22 files. `npm run check:data`: 3,947 on 26 files.

  Departures: `toDocument` and `toRecord` are in `model/documents.js`, not `presenter/mappers.js`, because the store uses them and the model must not import the presenter. A new row in section 8 and the md's review log: times set by the code instead of Mongoose timestamps, three extra stored fields, only the indexes in use.
- **24 Nov 2026 · M4, the store on MongoDB.** What: users, sessions, wallets, ledger entries, orders and trades live in MongoDB; the server loads them at start and flushes every change. Files and how:
  - `model/store.js`: `open()` connects, builds the indexes, seeds an empty database when `SEED_ON_START=true` (otherwise it says to run `npm run seed`), and loads each collection with a sorted `find().lean()`. `flush()` compares every record with the copy last written and sends one `bulkWrite` per collection; flushes run one at a time. A failed flush keeps its changes, retries in 5 s and shows on `/health`. `persist()` flushes within 200 ms. `remember()` takes in only what changed in MongoDB since the last flush, so an unflushed change isn't undone. `reset()` reseeds both stores. The six collections left `store.json`.
  - `model/documents.js`: `changedPaths` and `fieldsThatDiffer`; the user's `watchlist`, embedded, with its three handlers. `model/seed.js`: which keys stay in the file.
  - `view/routes/index.js` awaits a flush after every request that isn't a GET, refused ones included. `server.js` exits with a clear message when MongoDB can't be reached, and flushes on Ctrl+C. New sessions carry `expiresAt`, renewed on refresh.
  - `scripts/checks/harness.mjs` starts a `mongodb-memory-server` (11.4.0, `mongod` 8.2.6) per check file with `SEED_ON_START=true` and `BCRYPT_ROUNDS=4`. npm 11 holds back that package's install script; it isn't needed, because the first run fetches `mongod`. `.claude/settings.local.json` (git-ignored) lets Claude Code run the two check commands, by the owner's decision.

  Checks:
  1. On Atlas, from a script: the order, the wallet change and the ledger entry are there when `POST /orders` is answered (about 50 ms per write); the engine's own change follows within the 200 ms flush.
  2. After a restart the order and every balance are the same, the order is back on the book, and the `rt` cookie still refreshes.
  3. `npm run db:check-ledger` after the trades: all 59 wallets in step with 114 entries. With one wallet altered as the script read it, it names the wallet and exits 1.
  4. `npm run checks`: 476 in 22 files, each on its own in-memory database. `npm run check:data`: 3,947 on 26 files.

  Also checked on Atlas: the flush keeps `passwordHash` and `twoFactor.codeHash`; a flush made to fail shows on `/health` and is retried; a flush with nothing changed sends nothing.

  Departures from the plan: a flush `$set`s only the fields that changed and upserts only new records. The plan's upsert on every record would have made half a document out of a session that the TTL index had already deleted. Nothing new against the architecture.
- **24 Nov 2026 · M5, sign-in on MongoDB with bcrypt.** What: registering, logging in, the 2FA step, changing the password and switching 2FA use Mongoose queries; passwords and the 2FA code exist only as bcrypt hashes; every login has a session of its own. Files and how:
  - `model/schemas/User.js`: the `password` virtual (held in `$locals` for one save), `pre('save')` hashing with `BCRYPT_ROUNDS`, the error-handling `post('save')` that turns E11000 on the email into 409 `CONFLICT`, and the methods `comparePassword` and `compareCode`.
  - `model/services/auth.service.js` (new): `register`, `checkPassword` (`findByEmail`, `isLocked`, the comparison; wrong ones counted with `$inc`, the fifth sets `lockUntil`), `passwordMatches`, `setPassword`, `codeMatches`, `setTwoFactor`. Each writes to MongoDB, then calls `store.remember()`.
  - `handlers/auth.js`, `users.js` and the withdrawal's code check in `wallet.js` use it. A 2FA try is counted before the code is compared, and a ticket signs in once. Passwords over bcrypt's 72 bytes are refused. The sign-up credit comes from `DEMO_CREDIT_USDT`.
  - `exchange/session.js`: `startSession` does `Session.create()` for every login, with the device, the User-Agent, the IP and `expiresAt`; a session this browser already held ends. `isLive` also checks `expiresAt`, since MongoDB's TTL deletion runs a little later. `revoke` and `revokeOthers` forget the tokens as well.
  - The `credentials` and `lockouts` maps are gone from the working set, the seed and `store.json`. `lockUntil` joins the user record.

  Checks (on Atlas from a script, 23 of 23, and in `api.check`):
  1. Register 201 with a 10,000 USDT wallet; the same email again, in capitals, 409 `CONFLICT`. Three at the same moment with one email: one 201, two 409s.
  2. Five wrong passwords: 401, 401, 401, 401, 423 with `lockUntil`, which is on the user in Atlas.
  3. The demo login asks for the code; the code step gives 200 and a token.
  4. In Atlas the new user has a `$2b$12$` hash and no password field; `store.json` and the server's log hold no password.
  5. The Security page (`security.check`): the password changed, then used. On Atlas: the old one refused, the other device signed out.
  6. `npm run checks`: 492 in 22 files (476 before; `api` 62 instead of 46). `npm run check:data`: 3,947 on 26 files. `npm run db:check-ledger`: 60 wallets in step.

  Departures: the row "a sign-in revives the user's first session" is removed from section 8 and the md's review log. `security.check` now expects four devices, this login's first, so the Security page no longer matches its board's three. The answer for an unknown email is slowed by a bcrypt comparison but still comes sooner than a wrong password's (about 270 ms against 410 ms on Atlas), which also writes its count.
