# Orichal

A simulated spot crypto exchange for a course project: trade BTC, ETH, SOL and BNB against USDT with demo funds, on a matching engine you can see into. No real money and no blockchain.

The plan is in [`architecture_declaration/crypto-exchange-architecture-declaration (1).md`](architecture_declaration/crypto-exchange-architecture-declaration%20(1).md) and the screens in [`ui_design/`](ui_design). The **static frontend phase** built the client in plain HTML, CSS and JavaScript, running on demo data in the browser; section 8 of the architecture doc logs it. The **server phase** for CE-2 is building the real server, milestone by milestone as [`docs/server-plan.md`](docs/server-plan.md) sets out: since M2 the client talks to Express over HTTP and Socket.IO, and MongoDB comes next.

New to the code? [`docs/frontend-guide.md`](docs/frontend-guide.md) is a beginner's guide to the frontend, and [`docs/backend-guide.md`](docs/backend-guide.md) explains the server.

## Run it

Needs Node 22 or later.

```powershell
npm install
npm run dev
```

Then open http://localhost:5173. Any page can be opened directly, for example http://localhost:5173/trade/BTC-USDT.

## Demo accounts

The accounts and codes below live in the server's demo data. Until M5 the passwords are compared as plain text; then they become bcrypt hashes in MongoDB.

| Account | Email | Password | 2FA code |
| --- | --- | --- | --- |
| Demo trader | `demo@orichal.app` | `orichal-demo` | `123456` |
| Admin (Rohan Sethi) | `admin@orichal.app` | `orichal-demo` | none |

You can also create an account; it starts with 10,000 demo USDT.

The **Simulator · demo funds** badge in the header opens the demo controls: reset the demo data (on the server, so for every browser), drop the live connection for a few seconds (to see the reconnecting state), or make this browser's next request fail (to see error states).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Express server (`server/`) on port 5173 and restarts it when a file changes. It serves `client/`, where any path without a file falls back to `index.html` so links straight to a page work, and the API under `/api/v1`. `npm start` runs it without restarting |
| `npm run check:data` | Checks the demo data in `client/src/models/data`: every balance equals the sum of its ledger entries, ids are unique, locks match open orders and pending withdrawals, amounts fit their decimals |
| `npm run boards` | Cuts each design board out of the PDFs as a JPEG plus its text layer, into `.boards/` (git-ignored) |
| `npm run shots -- --as=demo /wallet` | Screenshots pages at 1440 and 390 px into `.screenshots/` (git-ignored), with Playwright; `--fresh` resets the demo data first, `--verified` confirms the email so the verify banner doesn't show, `--kyc=none` puts the identity check back to Not started |
| `npm run compare -- /markets screens-p03-markets` | Compares a page's text positions and sizes with a board's text layer (from `npm run boards`) and flags anything more than a few px off; takes `--as`, `--fresh`, `--verified`, `--kyc`, `--width`, `--height` and `--dx`, and `--fill`, `--click` and `--wait-for` steps to reach a state such as the code step |
| `npm run checks` | Runs the Playwright behaviour checks in `scripts/checks/`, one file per page plus `api` for the API alone, each against its own server with a fresh copy of the demo data; `npm run checks -- trade` runs one. Each file prints its failures and its count; `--shots` also saves the few screenshots some checks take |
| `npm run vendor` | Copies the fonts, the QR encoder and the Socket.IO client out of `node_modules` into `client/assets` (the copies are committed) |

## How it fits together

```text
client/
├── index.html           the one page shell
├── assets/              fonts, favicon, icons, vendored QR encoder and Socket.IO client
├── styles/              tokens.css (section 7), base.css, components/, pages/
└── src/
    ├── app/             router, routes, guards, start-up
    ├── models/          api/ (one client per API group, over fetch), data/ (seed JSON),
    │                    realtime/ (the Socket.IO socket), domain/ (money and rules), stores/
    ├── presenters/      one per page or widget: calls models, formats, returns { vm, actions }
    └── views/           layouts/, pages/, components/: build the DOM from vm and actions
server/                  the Express server, built in the CE-2 phase (server/README.md, docs/server-plan.md)
scripts/                 tooling: data check, board extraction, screenshots, vendored files,
                         checks/ (behaviour checks), data/ (how the demo data was generated)
```

- **Model, View, Presenter.** Views never import models and never format numbers or dates; only page and layout modules call presenters. Money stays a decimal string and is calculated only in `models/domain/money.js`, with BigInt.
- **The server** (`server/`) answers section 4's endpoints with the `{ success, data }` envelope, and pushes the live events over Socket.IO. It holds a market simulator (a market-maker ladder, a bot taker, tickers and candles), a matching engine (pending, then open or filled, with ledger entries for every lock, fill, fee and unlock) and the Socket.IO gateway. In the static phase the same code ran inside the browser as a mock backend.
- **Demo data** is seeded from the JSON in `client/src/models/data`, shaped like the API's DTOs. On the first start (or a reset) every timestamp moves forward so the newest lands just before now, and the result is saved in `server/data/store.json`, so the accounts age like live ones. Prices restart from the boards' values each time the server starts.

## Not built yet

- Stretch pages (coin detail, convert, alerts, notifications, password reset, email verification page, admin assets and audit logs) show a "not built yet" page.
- Google sign-in and card deposits need the backend. The OAuth callback page shows Google's error, if any, and says so.
- The dark theme isn't designed; the theme toggle stays, and the tokens are ready for a dark set.
