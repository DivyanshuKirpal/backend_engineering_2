# server/

The Orichal server: Express 5 serving the client (`client/`), the REST API (`/api/v1`) and the live events (Socket.IO at `/socket.io`) from one origin, http://localhost:5173. It is built milestone by milestone as [`docs/server-plan.md`](../docs/server-plan.md) sets out, and [`docs/backend-guide.md`](../docs/backend-guide.md) explains the code.

## Run it

You need Node.js 22 or later. From the repository root, in PowerShell:

```powershell
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev` runs `node --watch`, which restarts the server when a file it uses changes; `npm start` runs it once, without watching. Ctrl+C stops it and saves the data first.

The server needs MongoDB: copy the example settings and put your connection string in the copy (see MongoDB below). Every other variable has a default.

```powershell
Copy-Item server/.env.example server/.env
```

`server/.env` is git-ignored; never commit real secrets. A bad value stops the server at start with a message naming the variable.

Check that the API answers (in PowerShell, plain `curl` is a different command, so use `curl.exe` or `Invoke-RestMethod`):

```powershell
curl.exe http://localhost:5173/api/v1/health
Invoke-RestMethod http://localhost:5173/api/v1/markets
```

## MongoDB

`MONGO_URI` in `server/.env` names the database: the team uses MongoDB Atlas. Put the SRV string there with the database name `/orichal`, and add each laptop's IP under Network Access in Atlas.

```powershell
npm run seed                 # fills the six collections and the JSON store
npm run seed -- --yes        # the same, when the Atlas database already holds data (it is wiped)
npm run db:check-ledger      # proves every wallet equals the sum of its ledger entries
```

Run the seed once before the first start: the server won't start on an empty database (unless `SEED_ON_START=true`). Stop the server before seeding: it keeps its own copy of the data in memory. MongoDB and `server/data/store.json` are seeded together and belong together, so seed on the laptop you run. Two servers must not share one database for the same reason; a teammate uses another database name at the end of `MONGO_URI` (`/orichal-name`).

## The data

While the server runs, the data lives in memory as its working set. Users, sessions, wallets, ledger entries, orders and trades are saved in MongoDB, before each write request is answered; the other collections are saved in `server/data/store.json` (`STORE_FILE`, git-ignored). To start again from the seed data, run `npm run seed -- --yes` or use **Reset demo data** in the header's Simulator menu, which resets the database for everyone.

## Demo routes

With `DEMO_CONTROLS=true` (the default), `/api/v1/demo` serves the Simulator menu: `POST /demo/reset` and `POST /demo/fail-next` (the next API request from the same browser answers 503). With `TEST_ROUTES=true` as well, the routes only the checks use appear: `POST /demo/kyc-status`, `POST /demo/email-verified` and `GET /demo/db`, a read-only snapshot of the data.

## What is here

```text
server/
├── .env.example                 every variable, with a safe example value
├── data/                        git-ignored: store.json
├── scripts/                     seed.js (npm run seed), check-ledger.js (npm run db:check-ledger)
└── src/
    ├── server.js                starts the exchange, then the HTTP server and Socket.IO on PORT
    ├── app.js                   the middleware, in order: helmet, morgan (API lines only), JSON and
    │                            cookie parsing, /api/v1, the API's 404, the client's files, the
    │                            index.html fallback, the error handler
    ├── config/
    │   ├── env.js               reads server/.env and checks every variable with Zod
    │   └── db.js                the Mongoose connection, its log lines and its state for /health
    ├── lib/
    │   ├── errors.js            ApiError and the helpers for section 4's error codes
    │   ├── decimal.js           decimal strings to Decimal128 and back
    │   └── util.js              list paging, small body checks, token lifetimes
    ├── middleware/
    │   ├── notFound.js          an /api path with no route: 404 NOT_FOUND
    │   ├── failNext.js          the Simulator menu's "make the next request fail"
    │   └── errorHandler.js      the only writer of error responses
    ├── model/                   MODEL: the data and the exchange
    │   ├── store.js             the working set: loaded from MongoDB, flushed back with $set bulk writes
    │   ├── seed.js              how the demo data is made, and how it fills MongoDB
    │   ├── documents.js         records to MongoDB documents and back, field by field
    │   ├── schemas/             the Mongoose models: User, Session, Wallet, LedgerEntry, Order, Trade
    │   ├── services/            auth.service.js: registering and signing in against MongoDB
    │   └── exchange/
    │       ├── engine.js        matching and settlement: pending, open, filled, cancelled
    │       ├── market.js        the market simulator: books, the bot's ladder and taker, tickers, candles
    │       ├── wallet.js        the only code that changes a balance; a ledger entry for every change
    │       ├── session.js       one session per login, the rt cookie, access tokens, audit entries
    │       ├── bus.js           the in-process event bus the gateway taps
    │       ├── lifecycle.js     start-up and the demo reset
    │       └── text.js          the server's own number grouping for notification text
    ├── presenter/               PRESENTER: check input, call the model, shape the answer
    │   ├── handlers/            one table of [method, path, handler] per section 4 group, plus demo.js
    │   └── mappers.js           records to the DTOs of section 4
    └── view/                    VIEW: which URL, which middleware
        ├── http/respond.js      the envelope: ok, created, accepted, noContent, fail
        ├── routes/index.js      the /api/v1 router and the adapter that mounts the handler tables
        └── sockets/gateway.js   Socket.IO: the handshake, public and private rooms, the bus relay
```

The client reaches all of it through `client/src/models/api/http.js` (`fetch` to `/api/v1`) and `client/src/models/realtime/socket.js` (the vendored Socket.IO client). The mock backend that used to run inside the browser is gone; its code is what moved into `src/model` and `src/presenter`.
