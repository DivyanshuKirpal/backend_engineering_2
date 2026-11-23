# The Orichal server: a guide for the viva

This guide explains the server built in the CE-2 phase, for a teammate getting ready for the viva. It grows by one section per milestone, written when that milestone is finished and pushed, so every section describes code that exists and runs. The plan behind the work is [`docs/server-plan.md`](server-plan.md); the browser side is explained in [`docs/frontend-guide.md`](frontend-guide.md). At M10 this guide gains two traces through the code, a file-by-file list, the course-topic map and a glossary.

## Contents

1. [M0. The plan in the repo](#m0-the-plan-in-the-repo)
2. [M1. The Express skeleton](#m1-the-express-skeleton)
3. [M2. The API on the server](#m2-the-api-on-the-server)
4. [M3. MongoDB, the models and the seed](#m3-mongodb-the-models-and-the-seed)

## M0. The plan in the repo

M0 writes no server code. It puts the phase's rules and plan into the repository, keeps secrets and run-time files out of Git, records where the server will differ from the architecture declaration, and brings GitHub up to date (the frontend guide commit, then the plan commit).

### Where the rules live

| File | What it holds | Read it when |
| --- | --- | --- |
| [`CLAUDE.md`](../CLAUDE.md) | The standing rules: what is in and out of scope, the server's three layers, how money and ids are handled, where secrets live, and what "done" means for a milestone | Before changing anything |
| [`docs/server-plan.md`](server-plan.md) | The plan: decisions with their reasons, the folder layout, the environment variables, milestones M0 to M10 with their checks, the course-topic (CHO) coverage, the departures, the checklist and the dated log | Before starting a milestone, and to see what is done |
| [The architecture declaration](../architecture_declaration/crypto-exchange-architecture-declaration%20(1).md) | The plan for the *full* build, revision 3: section 1 the server folders and variable names, 3 the database schemas, 4 the endpoints and error codes, 6 the MVP layers. Section 9 points to the server plan, and the review log's "Server, CE-2 phase" table lists the departures | When a milestone builds a schema, an endpoint or a layer |
| `docs/backend-guide.md` | This file | Before the viva |

**Why a separate plan instead of rewriting the architecture declaration?** The declaration describes the finished system: Redis, a separate engine process, Docker, Nginx, React. CE-2 builds only a slice of it. Rewriting sections 1 to 7 would lose the target design, so the declaration stays the target and every place this phase does less, or does something differently, is one row in a *departures* table with its reason. If an examiner asks "why no Redis?", the answer is a row in that table.

### Keeping secrets and run-time files out of Git

[`.gitignore`](../.gitignore) is a list of path patterns that Git leaves untracked: `git status` doesn't offer them and `git add .` skips them. M0 adds three entries, each with a comment in the file saying why.

| Entry | What it keeps out | Why |
| --- | --- | --- |
| `server/.env` | The real secrets: the JWT signing keys and the MongoDB connection string with its password | Anyone holding the JWT secret can sign a token for any user, the admin included, and anyone holding the connection string can read or wipe the database. Git history is permanent and GitHub copies it to every clone, so a secret pushed once must be treated as leaked and replaced, even after a later commit deletes it |
| `server/data/` | What the server writes while it runs: the JSON store (`store.json`) and uploaded KYC images | It is generated (`npm run seed` rebuilds it from M3), it changes on almost every request, and the images are identity documents, which don't belong in a repository |
| `claude_conversation.txt` | The local record of the AI-assisted build conversation | It was ignored only through `.git/info/exclude`, which sits inside `.git/` and is never pushed, so a fresh clone wouldn't ignore it. `.gitignore` is committed, so every clone gets the rule |

Two details of the patterns:

- `server/.env` matches that one file and nothing else, so `server/.env.example` (added in M1) is still committed. That file lists every variable with a safe example value. A teammate copies it to `server/.env` and fills in their own secrets, so the code knows which variables exist without the repository ever holding a real one.
- `server/data/` ends in a slash, so it matches the folder and everything inside it, however deep (`server/data/uploads/kyc/<userId>/…`).

`.gitignore` only affects files Git isn't tracking yet. A file that was committed before stays tracked until `git rm --cached` removes it from the index. None of these three paths was ever committed (`git log --all -- claude_conversation.txt server/.env server/data` prints nothing), so the new rules are enough.

To see which rule ignores a path, ask Git (`-v` prints the file and the line of the matching rule):

```powershell
git check-ignore -v claude_conversation.txt server/.env server/data/store.json
# .gitignore:22:claude_conversation.txt   claude_conversation.txt
# .gitignore:16:server/.env                server/.env
# .gitignore:19:server/data/               server/data/store.json
git check-ignore -v server/.env.example
# prints nothing: this file must be committed
```

### Where the server departs from the architecture declaration

The departures fall into three groups. The full list, one row each with its reason, is section 8 of the plan and the review log's "Server, CE-2 phase" table in the architecture declaration.

1. **Fewer moving parts for CE-2.** The matching engine and the market simulator run inside the API process and talk over an in-process event bus, instead of a separate engine process fed by Redis Streams with a leader lock. There are no rate limits yet (they need Redis), morgan writes the request logs instead of pino, KYC images go to a folder on disk instead of Cloudinary, and two-factor sign-in keeps the demo's fixed code, stored as a bcrypt hash, instead of TOTP.
2. **Reuse instead of rewrite.** The browser's mock backend already answers all 61 endpoints in the right shapes and has a tested engine. So the mock's handlers and engine move into `server/src` (M2) instead of being rewritten, and the server imports the client's money and order rules, so both sides share one implementation. That is why the server is written as ES modules, like the client, with one `package.json` at the root. Express serves both the client and the API from one origin on port 5173, so there is no CORS and the refresh cookie stays first-party.
3. **A smaller database.** Six collections live in MongoDB (users, sessions, wallets, ledger entries, orders and trades); the rest stay in a JSON file until the final evaluation. The engine works on an in-memory copy, and its changes reach MongoDB in bulk writes before the request that made them is answered. There are no multi-document transactions yet, and a trade is stored as one document per side of a fill.

### How to check M0

```powershell
git status                                  # "nothing to commit, working tree clean"
git check-ignore -v claude_conversation.txt # names .gitignore, not .git/info/exclude
git log origin/main --oneline -2            # the plan commit, then the frontend guide commit
```

On GitHub, the `main` branch shows the same two commits at the top.

### Be ready to answer

- **Why is `server/.env` ignored when `server/.env.example` is committed?** The first holds real secrets; the second only names the variables, with harmless values, so a new teammate knows what to fill in.
- **What if a secret is pushed by mistake?** Deleting it in a new commit isn't enough, because it stays in the history and in every clone. Replace it: a new JWT secret (which signs everyone out), a new database password.
- **What is the difference between `.gitignore` and `.git/info/exclude`?** Both hold ignore patterns. `.gitignore` is committed and shared with every clone; `.git/info/exclude` is local to one copy of the repository.
- **Why does the server differ from the architecture declaration?** CE-2 builds a slice of the full design. Each difference is a row in the departures table with its reason, and the declaration stays the target for the final evaluation.
- **Why does every milestone end with a commit and a push?** Each push is a working state on GitHub. If time runs out, the last pushed milestone still runs; section 11 of the plan says where to stop.

## M1. The Express skeleton

Until M1, `npm run dev` started `serve`, a ready-made tool that only hands out the files in `client/`. M1 replaces it with our own server, built on **Express**, the most widely used web framework for Node.js. The server hands out the same files in the same way, and adds the first API route (`GET /api/v1/health`), the API's response envelope and its error handling. The client still answers its API calls with the mock backend inside the browser, so every page works as before; M2 moves the mock's code onto this server.

The packages M1 adds (`npm install` puts them in `node_modules/`, and `package.json` lists them under `dependencies`):

| Package | What it does here |
| --- | --- |
| `express` 5 | The web framework: routing, middleware, request and response helpers |
| `helmet` | Sets security headers on every response |
| `morgan` | Writes one log line per API request (since M2; in M1 it logged every file too) |
| `cookie-parser` | Turns the `Cookie` header into `req.cookies` (the refresh cookie needs it from M2) |
| `zod` | Checks data against a schema; here, the settings in `server/.env` |

### Middleware and why its order matters

A **middleware** is a function `(req, res, next)`. `req` is the request (method, path, headers, body), `res` is the response being built, and `next()` hands the request to the next middleware. Express runs the middleware in the order `app.js` registers them. Each one either *answers* (`res.json(...)`, `res.sendFile(...)`), which ends the walk, or *passes it on* with `next()`. Calling `next(err)`, or throwing, skips every ordinary middleware and jumps to the **error-handling middleware**, which Express recognises by its four parameters `(err, req, res, next)`.

[`server/src/app.js`](../server/src/app.js) registers nine steps. Here is what each one does with three requests:

| Step | `GET /api/v1/health` | `GET /trade/BTC-USDT` | `POST /api/v1/health` with the body `{bad` |
| --- | --- | --- | --- |
| 1. `helmet()` | adds the security headers, `next()` | same | same |
| 2. `morgan('dev')` | notes the start time; writes the log line once the response is sent | skipped: not an `/api` path (since M2) | same as the first |
| 3. `express.json({ limit: '100kb' })` | no body: `next()` | no body: `next()` | can't parse it: `next(err)`, straight to step 9 |
| 4. `cookieParser()` | fills `req.cookies`, `next()` | same | (skipped) |
| 5. `/api/v1` router | `GET /health` **answers 200** | not under `/api/v1`: skipped | (skipped) |
| 6. `/api` → `notFound` | | not under `/api`: skipped | (skipped) |
| 7. `express.static('client')` | | no file called `trade/BTC-USDT`: `next()` | (skipped) |
| 8. `GET /{*splat}` fallback | | **sends `index.html`**; the client's router draws the Trade page | (skipped) |
| 9. `errorHandler` | | | **answers 400 `VALIDATION_ERROR`** |

Four choices in that order are worth being able to explain:

- **The parsers come before the router**, so the route sees `req.body` and `req.cookies` already filled in.
- **`notFound` on `/api` comes before the static files and the fallback.** A mistyped API path such as `/api/v1/nope` gets a JSON 404 that the client's `http.js` understands, not the HTML page with a 200.
- **The fallback comes after the static files.** A real file (`/src/app/main.js`) is sent as it is, and only a path with no file (`/trade/BTC-USDT`) gets `index.html`. That is how a single-page application lets you open any page directly.
- **`errorHandler` is last**, because an error only travels *forward* through the list: a handler registered first would never see errors raised after it.

### The files

**[`server/src/server.js`](../server/src/server.js)** starts everything: it imports the settings and the app, creates a server with Node's own `http.createServer(app)` and listens on `PORT`. Express on its own is only a function that answers a request; the HTTP module owns the port. The server is created explicitly instead of with `app.listen()` because Socket.IO (M2) attaches to this same server, so pages, API and live events share one port. If the port is taken, it exits with a message saying so.

**[`server/src/app.js`](../server/src/app.js)** is the middleware list above, with a comment at the top numbering the steps. Two settings in it:

- `express.static` sends `Cache-Control: no-cache` with every file, as `client/serve.json` did. The browser may keep a copy but must ask before using it. The server compares the file's `ETag` (a fingerprint of its size and modification time) and answers `304 Not Modified`, with no body, when nothing changed.
- `redirect: false` stops `express.static` from turning a folder path such as `/styles` into `/styles/`, so the path falls through to `index.html` as it did with `serve`.

**[`server/src/config/env.js`](../server/src/config/env.js)** reads the settings once, at start-up:

1. `process.loadEnvFile()` loads `server/.env`, if there is one, into `process.env`. A variable already set in the real environment wins over the file, so the checks can pass their own `PORT`.
2. A **Zod schema** describes each variable: its type, its allowed values and its default. For example, `PORT` must be a whole number from 1 to 65535 (5173 if unset), and `DEMO_CREDIT_USDT` must look like a decimal amount and stays a string, since money is never a JavaScript number.
3. `safeParse` checks everything at once. If anything is wrong, the server prints each bad variable's name and rule (never its value, which may be a secret) and exits with code 1.

Every other file imports the checked, frozen `env` object instead of reading `process.env`. A typo then fails loudly at start-up, not halfway through a request. The two JWT secrets are optional until M6, when tokens are signed with them.

**[`server/.env.example`](../server/.env.example)** lists every variable with a safe value and a comment; see [M0](#keeping-secrets-and-run-time-files-out-of-git) for why the real `.env` is never committed.

**[`server/src/lib/errors.js`](../server/src/lib/errors.js)** defines `ApiError(status, code, message, details)`, an `Error` that also carries the HTTP status and one of section 4's error codes, and helpers for the common ones: `badRequest` (400 `VALIDATION_ERROR`), `unauthenticated` (401), `forbidden` (403), `notFound` (404) and `conflict` (409). A handler that refuses a request simply throws, e.g. `throw notFound()`, and never builds a response itself.

**[`server/src/view/http/respond.js`](../server/src/view/http/respond.js)** holds the **envelope**, the one shape every answer has:

- success: `{ "success": true, "data": … }` from `ok` (200), `created` (201) or `accepted` (202), or no body at all from `noContent` (204);
- error: `{ "success": false, "error": { "code", "message", "details" } }`, from `fail`, which only the error handler calls.

The client's `http.js` unwraps exactly this shape, so keeping it in one file keeps both sides in step.

**[`server/src/middleware/notFound.js`](../server/src/middleware/notFound.js)** is mounted on `/api` after the router, so it only sees API requests no route answered. It doesn't write the 404 itself: it calls `next(notFound(...))`, so the error handler writes it like every other error.

**[`server/src/middleware/errorHandler.js`](../server/src/middleware/errorHandler.js)** is the only place that writes an error response. In order, it maps:

| The error | The answer |
| --- | --- |
| An `ApiError` | its own status and code |
| `express.json()` couldn't parse the body (`err.type === 'entity.parse.failed'`) | 400 `VALIDATION_ERROR` |
| The body is over 100 kb (`'entity.too.large'`) | 413 `PAYLOAD_TOO_LARGE` |
| Another error that Express's libraries mark with a 4xx `status`, such as a broken `%`-escape in the URL | 400 `VALIDATION_ERROR` |
| Anything else | 500 `INTERNAL`, with the stack written to the server's log next to the request line, and never sent to the client. In production the response doesn't even carry the error's message |

In **Express 5**, a promise rejected inside an `async` handler is passed to the error handler automatically. In Express 4 nothing caught it unless every handler wrapped its body in `try/catch` or a helper: the request never got an answer, and since Node 15 an unhandled rejection stops the whole process. That is why the handlers in this project have no `try/catch`. If the response has already started (`res.headersSent`), the handler passes the error on to Express's default handler, which can only close the connection.

**[`server/src/view/routes/index.js`](../server/src/view/routes/index.js)** creates the `/api/v1` router with one route: `GET /health` answers `{ status: "ok", uptimeSeconds, time }`. It lets Postman, a teammate or a monitoring tool ask "is the server up?" without signing in. M2 turns this file into the adapter that mounts the 61 routes moved from the mock, and M3 adds whether MongoDB is reachable.

**`package.json`** gains two scripts: `npm run dev` (`node --watch server/src/server.js`, which restarts the server when a file it imports changes) and `npm start` (the same without watching). `engines` now asks for Node 22 or later.

### Security headers from Helmet

| Header | What it tells the browser |
| --- | --- |
| `Content-Security-Policy` | Load scripts, styles, images and fonts only from this origin; no inline scripts, no plugins. If an attacker managed to inject a `<script>` pointing elsewhere, the browser would refuse to run it |
| `X-Content-Type-Options: nosniff` | Trust the `Content-Type` the server sends; never guess. A file sent as text can't be run as a script |
| `X-Frame-Options: SAMEORIGIN` | Don't show this site inside another site's frame (stops *clickjacking*) |
| `Referrer-Policy: no-referrer` | Don't tell other sites which Orichal page a link was clicked on |
| `Strict-Transport-Security` | Use HTTPS from now on. Browsers ignore it over plain `http://localhost` |
| (no `X-Powered-By`) | Express normally announces itself; Helmet removes the header, so the server's software isn't advertised |

Helmet's default policy also includes `upgrade-insecure-requests`, which asks the browser to fetch everything over HTTPS. Over plain `http://localhost`, Safari would then fail to load the page, so `app.js` keeps that directive for production only. A browser run through Home, Markets, the sign-in and a limit order recorded no policy violations.

### Status codes so far

| Code | Meaning | Example |
| --- | --- | --- |
| 200 OK | It worked; here is the answer | `GET /api/v1/health` |
| 201 Created | A new resource was made | (from M2: registering, a deposit) |
| 202 Accepted | Taken for processing, finished later | (from M2: an order the engine will match) |
| 204 No Content | Done; nothing to send back | (from M2: logging out) |
| 304 Not Modified | Your copy is still current | a second load of `/src/app/main.js` |
| 400 Bad Request | The request is malformed | the body `{bad` |
| 404 Not Found | Nothing is at that address | `GET /api/v1/nope` |
| 413 Payload Too Large | The body is over the limit | a 150 kb JSON body |
| 500 Internal Server Error | The server failed; not the client's fault | an unexpected exception |

The 4xx codes mean the client should change its request; the 5xx codes mean the server failed, and the same request might work later.

### How to check M1

```powershell
npm run dev
# in a second terminal:
curl.exe http://localhost:5173/api/v1/health      # 200 {"success":true,"data":{"status":"ok",...}}
curl.exe http://localhost:5173/api/v1/nope        # 404 NOT_FOUND, as JSON
curl.exe -X POST http://localhost:5173/api/v1/health -H "Content-Type: application/json" -d "{bad"   # 400 VALIDATION_ERROR
curl.exe -I http://localhost:5173/trade/BTC-USDT  # 200 text/html: the deep link gets index.html
```

Then open http://localhost:5173: Home, Markets, the demo sign-in with its code and a limit buy on the Trade page all work as before, and the terminal shows morgan's line for every API request.

### Be ready to answer

- **What is middleware, and why does the order matter?** A function that sees the request before the route does and either answers or calls `next()`. Order decides who sees the request first: the parsers before the routes, the API's 404 before the HTML fallback, the error handler last.
- **How does Express know `errorHandler` is an error handler?** It has four parameters. `next(err)` or a throw skips every ordinary middleware and goes to it.
- **What changed in Express 5 for async code?** A rejected promise from an `async` handler reaches the error handler on its own. Express 4 needed a `try/catch` or a wrapper in every handler; without one the request hung, and Node could stop the process.
- **Why `http.createServer(app)` and not `app.listen()`?** Both create a Node HTTP server; doing it ourselves keeps a handle on it, so Socket.IO can share the same server and port in M2.
- **Why check the settings with Zod at start-up?** A bad setting stops the server immediately, with the variable's name, instead of causing a confusing failure inside a request later. Secret values are never printed.
- **Why does an unknown API path get JSON while an unknown page gets `index.html`?** The client's `http.js` expects the envelope from `/api`, while page addresses belong to the client's router, which draws its own Not Found page.

## M2. The API on the server

In the static phase a **mock backend** ran inside the browser tab: JavaScript that answered all 61 API requests, ran the matching engine and the market simulator, and pushed live events through a fake socket. M2 moves that code onto the Express server. Every request the client makes now travels over HTTP to `/api/v1`, the live events arrive over a real WebSocket, and the data lives in one place for every browser. The client hardly changed: its two transports (`http.js` and `socket.js`) were built for this switch.

### What moved where

`git mv` moved each file, so `git log --follow` shows its history from the static phase.

| From `client/src/models/api/mock/` | To `server/src/` | What changed |
| --- | --- | --- |
| `db.js` | `model/store.js` | Reads the seed files with `fs` instead of `fetch`, and saves to `STORE_FILE` instead of `localStorage` |
| `engine.js`, `market.js`, `wallet.js`, `bus.js`, `text.js` | `model/exchange/` | Import paths. The bus feeds *taps* (the gateway), and the simulator keeps one timer per loop instead of piling them up |
| `session.js` | `model/exchange/session.js` | A real `rt` cookie; the device and IP come from the request |
| `routes/*.js` | `presenter/handlers/*.js` | Import paths; the session calls pass the request context |
| `mappers.js`, `util.js` | `presenter/mappers.js`, `lib/util.js` | None (plus `durationMs` in `util.js`) |
| `errors.js` | merged into `lib/errors.js` | `MockError` is `ApiError` |
| `server.js` | `view/routes/index.js` (the adapter), `view/sockets/gateway.js`, `presenter/handlers/demo.js`, `model/exchange/lifecycle.js` | Split by job |

The client's domain rules (`money.js`, `order.rules.js`, `market.rules.js`, `password.rules.js`, `withdrawal.rules.js`) did not move: the server imports them from `client/src/models/domain/`, so both sides check orders and money with one implementation.

### How one request travels: placing a limit buy

1. **Presenter.** The order form's presenter checks the order with `order.rules` and calls `order.api.place()`, which calls `request('POST', '/orders', …)` in [`http.js`](../client/src/models/api/http.js) with an `Idempotency-Key` header.
2. **Client transport.** `request()` adds `Authorization: Bearer <access token>` and sends it with `fetch('/api/v1/orders')` as JSON.
3. **Express.** In [`app.js`](../server/src/app.js): Helmet's headers, morgan's log line, `express.json()` turns the body into `req.body`, `cookie-parser` fills `req.cookies`, and the request enters the `/api/v1` router.
4. **Router.** In [`view/routes/index.js`](../server/src/view/routes/index.js): `exchangeReady` waits if a demo reset is under way, `failNext` lets it through, and the route `POST /orders` matches.
5. **Adapter.** It builds the context: who is asking (`session.fromHeader` finds the user behind the token), the params, the body, the cookies, the device and the IP. Then it calls the handler.
6. **Handler.** In [`presenter/handlers/orders.js`](../server/src/presenter/handlers/orders.js): `requireUser(ctx)`, then `engine.place()`.
7. **Model.** The engine checks the market rules again (the server never trusts the client's check), and the wallet locks the USDT. That writes a ledger entry and publishes `balance.update` on the bus. The engine saves the order as `pending`, the store saves the file 200 ms later, and the engine schedules the match.
8. **Response.** The handler returns `{ status: 202, data: { order } }`; the adapter answers through `respond.accepted()`: `202 { "success": true, "data": { "order": … } }`. `http.js` unwraps `data`, and the page shows the toast.
9. **Live update.** About half a second later the engine applies the order. It publishes `order.update` to `user:<id>` and an `orderbook` delta to `market:BTC-USDT`. The gateway sends each to the Socket.IO room of that name: the trader's page updates their order, and every page watching BTC/USDT, the admin's included, shows the new bid.

### The adapter

Each handler file exports a table of rows, `[method, path, handler]`, as the mock had them. A handler is a plain function: it receives a **context** and returns `{ status, data }`. It never sees Express's `req` or `res`, which is why the handlers moved almost unchanged and why "handlers never build Express responses" holds. The adapter does the Express part:

| Context field | Built from | Used for |
| --- | --- | --- |
| `params`, `query`, `body` | `req.params`, `req.query`, `req.body` (and Multer's files) | The request's input |
| `headers` | `req.headers` | `Idempotency-Key`, the bearer token |
| `cookies.get / set / clear` | `req.cookies`, `res.cookie()`, `res.clearCookie()` | The `rt` cookie and the fail-next switch |
| `userAgent`, `ip` | the `User-Agent` header, `req.ip` | Device names and audit entries |
| `user`, `session` | `session.fromHeader()` | Who is asking; `requireUser` and `requireAdmin` read it |

It registers each row with `router.get`, `router.post` and the rest, so this file is also where all 61 routes appear: a good place to show **routing**, **route parameters** (`/orders/:id`) and **query parameters** (`?state=open&market=BTC-USDT`) in the viva.

### The store

[`model/store.js`](../server/src/model/store.js) keeps the demo data in memory as one **working set**: an object of arrays (users, balances, ledger, orders, fills, …), which the engine and the simulator change directly. On the first start it reads the 17 seed files in `client/src/models/data`, moves every timestamp so the newest lands just before now, and saves. Later starts load the saved `server/data/store.json`.

- `persist()` saves 200 ms after the last change, so a burst of changes (an order's lock, fill, fee and unlock) is written once.
- A save writes `store.json.tmp` and then **renames** it over `store.json`. A rename is atomic on the disk, so a crash mid-save never leaves half a file.
- Ctrl+C (`SIGINT`) saves at once before the process exits.

In M4 six of these collections move to MongoDB, and the store loads them from there.

### Sessions and the real refresh cookie

The mock kept its stand-in for the refresh cookie in one `localStorage` key. Moved to a server unchanged, that one stand-in would be shared by every visitor, and everyone would be signed in as whoever logged in last. So the cookie had to become real in M2, before the JWTs of M6.

- At sign-in the server makes a random 32-byte token and sends it as the **`rt` cookie**:

  | Attribute | Effect |
  | --- | --- |
  | `HttpOnly` | The page's JavaScript can't read it, so a script injected into the page can't steal it |
  | `SameSite=Strict` | The browser never sends it with a request another site started (no cross-site request forgery) |
  | `Path=/api/v1/auth` | Sent only to the auth routes that read it, not with every request |
  | `Max-Age` 7 days | Renewed on every refresh |
  | `Secure` in production | Only over HTTPS once deployed |

- The store keeps only the token's **SHA-256 hash**, mapped to the session, so a copy of `store.json` can't sign anyone in. That map lives in the JSON store, so a server restart doesn't sign everyone out.
- The **access token** is a random string kept in server memory and in the page's memory, never in storage; the page sends it as `Authorization: Bearer`. After a restart the server has forgotten it, the next request gets 401, and `http.js` gets a new one from `POST /auth/refresh` with the cookie, then retries.
- `POST /auth/logout` revokes the session and forgets its tokens; the cookie is cleared.
- As in the static phase, a sign-in revives the user's first session, so the Security page shows the seeded devices with "This device" first, as its board does. A brand-new user gets a session named from the browser's `User-Agent`, with the request's IP. (A row in the departures table says so.)

M6 replaces both tokens with JWTs: a signed access token `{ sub, role, sid }` and a rotating refresh token `{ sid, ver }`.

### Live events with Socket.IO

HTTP is request and answer: the server can't speak first. A **WebSocket** is one connection that stays open, so the server can push a new price or an order update the moment it happens. **Socket.IO** adds events with names, automatic reconnection and rooms on top. The server only allows the WebSocket transport, not Socket.IO's HTTP long-polling fallback.

- **Rooms.** A room is a named group of sockets; `io.to('market:BTC-USDT').emit('orderbook', delta)` reaches every socket in it.
  - **Public rooms.** A client joins `tickers`, `market:{symbol}` or `candles:{symbol}:{interval}` by sending `subscribe` with `{ channel }`. Any other name is refused.
  - **The private room.** `user:{id}` is joined only from a valid access token in the handshake (`auth.token`), so nobody can join another user's room by name.
- **The relay.** The engine, the simulator and the wallet publish to the in-process bus. [`gateway.js`](../server/src/view/sockets/gateway.js) taps the bus and sends every event to the room with the channel's name.
- **The client.** [`socket.js`](../client/src/models/realtime/socket.js) wraps the vendored Socket.IO client and keeps the interface the presenters already used.
  - **Rejoining.** Rooms don't survive a reconnection, so it subscribes to all of its rooms again on every connect.
  - **After a drop.** It dispatches `reconnect`, and the presenters reload the book, orders and balances. Events published while it was away are gone (delivery is at most once), so reloading is the only safe recovery.
  - **After a refresh.** When `http.js` gets a new access token, the socket reconnects with it, so the server puts it back in the user's room.

### Uploads with Multer

The Verification page sends its form as `multipart/form-data`: text fields and image files in one body, which `express.json()` can't read. Multer, on `POST /kyc` only, reads it into memory: the text fields into `req.body`, the files into `req.files`. The adapter hands each file to the handler as `{ name, type, size }`, the shape the handler used to read from a browser `File`, so the handler's checks (JPEG or PNG, 5 MB) stayed as they were. M8 adds Multer's own limits and saves the files to disk.

### Demo and test routes

The Simulator menu used to call the mock directly; now it calls routes under `/api/v1/demo`, which exist only when the server runs with `DEMO_CONTROLS=true`:

- **`POST /demo/reset`** reseeds the data. On a server that is everyone's data, so a reset signs every browser out.
- **`POST /demo/fail-next`** sets a short-lived `fail_next` cookie. The next API request from *that browser* answers 503, and the cookie goes. A cookie rather than a switch on the server, so the admin's background refresh in a second window can't use the failure up.

With `TEST_ROUTES=true` as well, three routes exist only for the checks: `kyc-status` and `email-verified` set a user's state, and `GET /demo/db` returns a read-only copy of the data, without the plain demo passwords (which go in M5) or the cookie hashes.

### The checks against the real server

[`harness.mjs`](../scripts/checks/harness.mjs) starts the server for each check file on a spare port, with a temporary `STORE_FILE`, so every file begins from the seed data. It switches on the demo routes, the test routes and the simulated network delay (`DEMO_LATENCY`), because some checks look for loading states.

- **Signing in.** `signIn()` resets and logs in with `fetch` inside the page, so the browser stores the `rt` cookie and the next page load restores the session, as it would for a person.
- **Looking at the data.** Checks that used to read the mock's database read `GET /demo/db` with `snapshot()` instead.
- **The browser's network log.** It lists every 4xx answer, such as a wrong password's 401, as "Failed to load resource". The harness doesn't count those as page errors; a 500 still is one.
- **`api.check.mjs`** (formerly `mock.check.mjs`) calls the API from Node with `fetch`, as Postman will in M9. It has a small cookie jar that sends `rt` only under its path, as a browser would.
- **`screenshots.mjs` and `compare.mjs`** start the same server with the same sign-in.

### How to check M2

```powershell
npm run dev
```

1. Open http://localhost:5173 in one browser and a private window of another (or two browser profiles). Sign in as the demo trader in one and the admin in the other; each sees their own name. Both open Trade · BTC/USDT; the trader places a limit buy just under the best bid, and the bid appears in the admin's order book within a second, without a reload.
2. DevTools → Network: the API calls go to `/api/v1/…`, and under **WS** one connection is open to `/socket.io/?EIO=4&transport=websocket`; its **Messages** tab shows the events arriving.
3. Stop the server with Ctrl+C and start it again. After a reload you are still signed in, and the order is still on the Orders page: it came back from `server/data/store.json`.
4. `npm run checks` passes in every file, and `npm run check:data` passes.
5. A search of `client/` for `api/mock` finds nothing.

### Be ready to answer

- **How does one request travel?** `request()` in `http.js` → `fetch` → Express middleware (Helmet, morgan, `express.json`, cookie-parser) → the `/api/v1` router → the adapter builds the context → the handler → the engine, the wallet and the store → `{ status, data }` → `respond.js` writes the envelope → `http.js` unwraps `data`. The live part comes back over the WebSocket.
- **How do Socket.IO rooms work, and why can't I join another user's room?** A room is a named group of sockets the server can emit to at once. Public rooms are joined by name and checked against a pattern; the user room is joined only from a valid token in the handshake, and a request to join it by name is refused.
- **Why did the refresh cookie have to become real now?** The mock's one stand-in, moved to a server, would be shared by every visitor, so everyone would become whoever logged in last. A cookie lives in each browser, so each browser carries its own session.
- **Why httpOnly, SameSite=Strict and a path?** Scripts in the page can't read it, other sites can't make the browser send it, and it travels only to the routes that need it.
- **What happens when the WebSocket drops?** The client shows Reconnecting, Socket.IO reconnects, the socket rejoins its rooms, and the presenters reload, because the events published in between are gone.
- **Why write a temporary file and rename it?** A rename replaces the old file in one step, so a crash halfway through a save never leaves a broken store.

## M3. MongoDB, the models and the seed

M3 gives Orichal a MongoDB database on **Atlas** (MongoDB's cloud service), six **Mongoose** models, a seed script that fills them and a script that proves the money adds up. The app itself still runs on the JSON store; M4 moves it over.

MongoDB stores **documents** (JSON-like objects) in **collections**. Mongoose is the library between it and our code. A **schema** describes the shape of a document: its fields, types, rules, indexes. A **model** is a schema connected to a collection: the thing you call `find`, `create` and `aggregate` on.

### The connection

[`config/db.js`](../server/src/config/db.js) opens one connection at start-up with `mongoose.connect(MONGO_URI)`. Mongoose keeps a pool of sockets behind it, shares it between every query and reconnects by itself. The file logs *connected*, *disconnected* and errors, and turns a failure into a sentence saying what to check. It never prints the connection string, which holds the password. `GET /api/v1/health` reports `"mongo": "up"` or `"down"`.

### The six models

| Collection | One document per | Referenced or embedded, and why | Indexes, and the query each serves |
| --- | --- | --- | --- |
| `users` | person | Embeds preferences, two-factor settings and the watchlist (at most 50): small, bounded, always read with the user | `{ email }` unique: sign-in, and no two accounts with one email |
| `sessions` | signed-in device | References its user: sessions come and go on their own | `{ userId }`: the Security page's list. `{ expiresAt }` **TTL**: MongoDB deletes a session by itself once that time has passed |
| `wallets` | user and asset | References its user | `{ userId, asset }` unique: one wallet per asset |
| `ledgerEntries` | balance change | References its user: grows without limit, so it can't be embedded | `{ userId, asset, time: -1 }`: one asset's history, newest first. `{ refType, refId }`: the entries an order or a trade wrote |
| `orders` | order | References its user | `{ userId, status, createdAt: -1 }`: my open orders and my history. `{ market, status, createdAt }`: a market's open orders. `{ userId, clientOrderId }` unique: a retried request can't make a second order |
| `trades` | side of a fill | References its order and user | `{ userId, time: -1 }`: my trades. `{ orderId }`: an order's fills. `{ tradeId, orderId }` unique |

A **compound index** covers several fields in order. `{ userId, status, createdAt: -1 }` is sorted by user, then status, then newest first, so "my open orders, newest first" reads one short stretch of it and needs no sorting.

**Embedding or referencing?** Embed what is small, has a limit and is always read with its parent. Reference what grows without limit or is queried on its own. A user's ledger can have thousands of entries; inside the user document it would be loaded with every sign-in and would one day pass MongoDB's 16 MB limit per document.

### Types, and the Decimal128 trap

- **Money is `Decimal128`**, an exact decimal type. A JavaScript number is a binary float: `0.1 + 0.2` gives `0.30000000000000004`. The fields have a *getter*, so code reading a document sees a string such as `"1616.000800"`.
- Decimal128 prints small amounts with an exponent: `0.00000000` becomes `0E-8`. [`lib/decimal.js`](../server/src/lib/decimal.js) writes those out again, so a string goes in and comes out unchanged.
- **Ids are ObjectIds** and **times are Dates** in MongoDB, hex strings and ISO strings in the API. References must be ObjectIds: populate compares types, and a string never equals an ObjectId.

[`model/documents.js`](../server/src/model/documents.js) converts between the two shapes, the *records* the engine and the API use and the *documents* MongoDB stores, with one table row per field. Its paths are dotted (`'twoFactor.enabled'`), so an update can set one nested field without wiping its neighbours.

### Validation

Mongoose checks a document before it is written: `required`, `enum` (a side is `buy` or `sell`), `match` (an email looks like one), lengths, and our own validators (a balance can't be negative, a quantity must be above zero, `filledQuantity` can't pass `quantity`). What an order needs depends on it: a limit order needs a price, a market buy needs the amount to spend. A bad document gives a `ValidationError` naming every wrong path:

```text
new Order({ quantity: '-0.01', side: 'hold', … }).validate()
  quantity: quantity must be above zero
  side: `hold` is not a valid enum value for path `side`.
```

### Virtuals and statics

- A **virtual** is a property worked out on reading, not stored: `Wallet.total` (available + locked), `Order.remainingQuantity`, `Order.isOpen`, `User.isLocked`. Storing a total would risk it disagreeing with its parts.
- `Order.fills` is a **virtual populate**: Mongoose fills it with the trades whose `orderId` is this order's `_id`, through a second query. The order stores no list.
- A **static** is a method on the model: `User.findByEmail(email)`, `Order.findOpen(userId, market)`, and `LedgerEntry.balanceFor(userId, asset)`, which is an aggregation.
- `passwordHash` and `twoFactor.codeHash` are `select: false`: a query leaves them out unless it asks with `.select('+passwordHash')`.

### The seed

`npm run seed` ([`server/scripts/seed.js`](../server/scripts/seed.js), with the work in [`model/seed.js`](../server/src/model/seed.js)) reads the seed JSON, shifts its times to now, empties the six collections (`deleteMany`) and fills them through the models (`insertMany`), so validation runs on every document. The demo passwords and the 2FA code go in only as bcrypt hashes (M5 explains them). It refuses to wipe a database that isn't on this machine and holds data, unless it gets `--yes`.

Ledger entries written at the same instant (a fill's debit, credit and fee) get ids that ascend in writing order, and new ids are real ObjectIds, which ascend too. So sorting by `(time, _id)` always gives the ledger as it was written.

### The ledger check

`npm run db:check-ledger` ([`check-ledger.js`](../server/scripts/check-ledger.js)) proves that every wallet equals the sum of its ledger entries. MongoDB does the adding, in an **aggregation**: a pipeline whose stages each pass their result on.

```js
LedgerEntry.aggregate([
  { $match: { userId: { $in: peopleIds } } },            // keep people's entries
  { $group: {                                            // one result per user and asset
      _id: { userId: '$userId', asset: '$asset' },
      available: { $sum: '$deltaAvailable' },            // exact: Decimal128 stays Decimal128
      locked: { $sum: '$deltaLocked' },
  } },
]);
```

It compares each sum with the wallet and exits with code 1 on any difference.

### How to check M3

```powershell
npm run seed                 # add: -- --yes   to reseed Atlas
npm run db:check-ledger      # All 59 wallets of 54 people equal the sums of their 105 ledger entries.
curl.exe http://localhost:5173/api/v1/health    # while npm run dev runs: "mongo":"up"
```

In Atlas: **Browse Collections** → `orichal`. Open `users`, find `{ "email": "demo@orichal.app" }`: `passwordHash` starts with `$2b$12$`, and there is no password field. The **Indexes** tab of each collection lists the indexes above.

### Be ready to answer

- **What is the difference between a schema and a model?** The schema is the description; the model is that description bound to a collection, with the query methods.
- **Why Decimal128?** Floats can't hold most decimal fractions exactly, and money must be exact.
- **Which index serves which query?** The table above; read a compound index left to right.
- **What is a virtual?** A property worked out when read, such as `Wallet.total`. Nothing is stored, so nothing can disagree.
- **Embedding or referencing?** Preferences are embedded; the ledger is referenced, because it grows without limit and is queried on its own.
- **What does the aggregation do?** `$match` keeps the entries, `$group` adds them up per user and asset, and the script compares the sums with the wallets.
