# Orichal: standing rules (server phase, CE-2)

Orichal is a simulated crypto exchange for a course project. The client is finished: plain HTML, CSS and JavaScript on a mock backend that ran in the browser. This phase builds the real server before the CE-2 evaluation: Node.js and Express with Socket.IO and MongoDB.

## Sources of truth

- `docs/server-plan.md` is this phase's plan: scope, decisions, milestones with their checks, the CHO coverage, the departures from the architecture, the checklist and the log. Work from it, milestone by milestone.
- `architecture_declaration/crypto-exchange-architecture-declaration (1).md`, revision 3, is still the plan for the full build. Section 3 gives the schemas (types, enums, references, indexes), section 4 the endpoints, envelope, error codes, token rules and socket events, section 1 the server tree and environment variable names, section 6 the MVP rules. Section 8 is the static phase's log and is closed.
- In practice the contract is what the client already sends and expects: `client/src/models/api/*.js` and the presenters. The handlers moved from the mock keep their DTOs, so a response may only change shape if the plan says so.
- Where this phase does something other than sections 1 to 7, the plan's departures table says so, and each departure gets a row in the md's review log under "Server, CE-2 phase".
- File names hold spaces and brackets: always quote the paths.

## Scope

- In: Express 5 serving the client and `/api/v1` from one origin on port 5173; Socket.IO for live events; MongoDB with Mongoose for users, sessions, wallets, ledger entries, orders and trades; the other collections in `server/data/store.json`; bcryptjs, JWT access tokens and the rotating `rt` refresh cookie; Zod validation; Multer uploads; morgan; Helmet; a Postman collection run with Newman.
- Out until the final evaluation: React and Vite, Redis, a separate engine process, Docker, Nginx, CI, deployment, rate limits, TOTP, Google sign-in, email, Cloudinary, Stripe, the 9 stretch pages and the dark theme. Don't start any of these without the owner asking.
- Client changes in this phase are limited to `models/api/http.js`, `models/realtime/socket.js`, the navbar presenter's demo controls, a small `demo.api.js` client and the vendored Socket.IO client.

## Server rules

- Node 22, ES modules (`"type": "module"` at the root). One `package.json` at the root for client tooling, server and checks.
- Express 5: errors from async handlers reach the error handler without wrappers; `req.query` is read-only, so validated input goes on `req.input`; `req.body` is `undefined` when nothing was parsed; a wildcard route needs a name (`/{*splat}`).
- Layers on the server, as section 6 maps them: `view/` (routes, the adapter, sockets: which URL, which middleware), `presenter/` (handlers that check input, call the model and map records to DTOs; validators; mappers), `model/` (schemas, services, the exchange core, the store). Routes never call Mongoose; handlers never build Express responses.
- One envelope: `{ success: true, data }` or `{ success: false, error: { code, message, details } }`, with section 4's status codes and error codes. Handlers throw `ApiError`; only `middleware/errorHandler.js` writes error responses. Another user's order, transaction or application answers 404, not 403.
- Money is a string in the API, BigInt through `client/src/models/domain/money.js` in code, and Decimal128 in MongoDB. Never `Number` or `parseFloat` for an amount. The server imports the client's domain rules (`money`, `order.rules`, `market.rules`, `password.rules`) so both sides share one implementation.
- Ids are 24-character hex strings in the API and the working set, and ObjectIds in MongoDB. References must be ObjectIds or populate finds nothing.
- The matching engine and the market simulator work on the store's in-memory working set. Auth reads and writes MongoDB directly and then calls `store.remember()`. Everything else reaches MongoDB through `store.flush()`, which `$set`s changed fields and never replaces a document, because the working set doesn't hold `passwordHash`.
- Secrets live in `server/.env` (git-ignored); `server/.env.example` lists every variable with a safe example. Passwords exist only as bcrypt hashes. Never log passwords, tokens, cookies or 2FA codes.
- Demo-only routes (`/api/v1/demo/*`) are mounted only when `DEMO_CONTROLS=true`; the routes only the checks use need `TEST_ROUTES=true` as well.

## Client rules (unchanged from the static phase)

- MVP: views are functions of `(vm, actions)` that build DOM through `views/dom.js`; presenters return `{ vm, actions }` and format through `formatters/`; models hold data and rules. Views never import models and never format numbers or dates. Only page and layout modules call presenters.
- URLs are root-relative (`/styles/…`, `/src/…`), and pages load through dynamic `import()`. No frameworks or build tools in the client.
- Accessible: semantic HTML, real buttons and labels, visible focus, colour never the only signal.

## Working

- Do the milestones in `docs/server-plan.md` in order, one at a time. Inside a milestone, build one file or group of related files at a time and run its check before moving on.
- A milestone is done when its checks pass and, from M2 on, `npm run checks` and `npm run check:data` pass too; the plan's checklist is ticked and its log has a dated entry (what, which files, how, any departure); `docs/backend-guide.md` has a section on the new code, written for a teammate preparing the viva; and the work is committed with a clear message and pushed with `git push origin main`.
- Stop after each milestone with a short summary and wait for the owner's go-ahead. Ask during a milestone only when something is unclear or hard to undo.
- Never commit `claude_conversation.txt`, `server/.env`, `server/data/` or uploaded files.

## Demo accounts

- `demo@orichal.app`, password `orichal-demo`, 2FA code `123456`.
- `admin@orichal.app` (Rohan Sethi), password `orichal-demo`, no 2FA.

## Commands

Fill this list in as the scripts appear.

- `npm run dev`: the server with `--watch` on http://localhost:5173 (from M1)
- `npm start`: the same server without `--watch` (from M1)
- `npm run seed`: resets MongoDB and the JSON store from `client/src/models/data` (from M3)
- `npm run checks`, `npm run check:data`: behaviour and data checks
- `npm run db:check-ledger`, `npm run db:explain`: ledger aggregation and query plans (M3, M7)
- `npm run test:api`: the Postman collection through Newman, on a server and an in-memory MongoDB of its own (M9)
