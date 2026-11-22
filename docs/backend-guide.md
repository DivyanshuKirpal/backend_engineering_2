# The Orichal server: a guide for the viva

This guide explains the server built in the CE-2 phase, for a teammate getting ready for the viva. It grows by one section per milestone, written when that milestone is finished and pushed, so every section describes code that exists and runs. The plan behind the work is [`docs/server-plan.md`](server-plan.md); the browser side is explained in [`docs/frontend-guide.md`](frontend-guide.md). At M10 this guide gains two traces through the code, a file-by-file list, the course-topic map and a glossary.

## Contents

1. [M0. The plan in the repo](#m0-the-plan-in-the-repo)
2. [M1. The Express skeleton](#m1-the-express-skeleton)

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
| `morgan` | Writes one log line per request |
| `cookie-parser` | Turns the `Cookie` header into `req.cookies` (the refresh cookie needs it from M2) |
| `zod` | Checks data against a schema; here, the settings in `server/.env` |

### Middleware and why its order matters

A **middleware** is a function `(req, res, next)`. `req` is the request (method, path, headers, body), `res` is the response being built, and `next()` hands the request to the next middleware. Express runs the middleware in the order `app.js` registers them. Each one either *answers* (`res.json(...)`, `res.sendFile(...)`), which ends the walk, or *passes it on* with `next()`. Calling `next(err)`, or throwing, skips every ordinary middleware and jumps to the **error-handling middleware**, which Express recognises by its four parameters `(err, req, res, next)`.

[`server/src/app.js`](../server/src/app.js) registers nine steps. Here is what each one does with three requests:

| Step | `GET /api/v1/health` | `GET /trade/BTC-USDT` | `POST /api/v1/health` with the body `{bad` |
| --- | --- | --- | --- |
| 1. `helmet()` | adds the security headers, `next()` | same | same |
| 2. `morgan('dev')` | notes the start time; writes the log line once the response is sent | same | same |
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

Then open http://localhost:5173: Home, Markets, the demo sign-in with its code and a limit buy on the Trade page all work as before, and the terminal shows morgan's line for every request.

### Be ready to answer

- **What is middleware, and why does the order matter?** A function that sees the request before the route does and either answers or calls `next()`. Order decides who sees the request first: the parsers before the routes, the API's 404 before the HTML fallback, the error handler last.
- **How does Express know `errorHandler` is an error handler?** It has four parameters. `next(err)` or a throw skips every ordinary middleware and goes to it.
- **What changed in Express 5 for async code?** A rejected promise from an `async` handler reaches the error handler on its own. Express 4 needed a `try/catch` or a wrapper in every handler; without one the request hung, and Node could stop the process.
- **Why `http.createServer(app)` and not `app.listen()`?** Both create a Node HTTP server; doing it ourselves keeps a handle on it, so Socket.IO can share the same server and port in M2.
- **Why check the settings with Zod at start-up?** A bad setting stops the server immediately, with the variable's name, instead of causing a confusing failure inside a request later. Secret values are never printed.
- **Why does an unknown API path get JSON while an unknown page gets `index.html`?** The client's `http.js` expects the envelope from `/api`, while page addresses belong to the client's router, which draws its own Not Found page.
