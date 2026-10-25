# Orichal

A simulated spot crypto exchange for a course project: trade BTC, ETH, SOL and BNB against USDT with demo funds, on a matching engine you can see into. No real money and no blockchain.

The plan is in [`architecture_declaration/crypto-exchange-architecture-declaration (1).md`](architecture_declaration/crypto-exchange-architecture-declaration%20(1).md) and the screens in [`ui_design/`](ui_design). This is the **static frontend phase**: the client only, in plain HTML, CSS and JavaScript, running on demo data in the browser. Section 8 of the architecture doc logs what this phase builds and where it differs from the plan.

## Run it

Needs Node 20 or later.

```powershell
npm install
npm run dev
```

Then open http://localhost:5173. Any page can be opened directly, for example http://localhost:5173/trade/BTC-USDT.

## Demo accounts

Sign-in is a **mock**: the accounts and codes below live in the demo data, and nothing is checked against a server.

| Account | Email | Password | 2FA code |
| --- | --- | --- | --- |
| Demo trader | `demo@orichal.app` | `orichal-demo` | `123456` |
| Admin (Rohan Sethi) | `admin@orichal.app` | `orichal-demo` | none |

You can also create an account; it starts with 10,000 demo USDT.

The **Simulator · demo funds** badge in the header opens the demo controls: reset the demo data, drop the live connection for a few seconds (to see the reconnecting state), or make the next request fail (to see error states).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Serves `client/` on port 5173; any path without a file falls back to `index.html`, so links straight to a page work |
| `npm run check:data` | Checks the demo data in `client/src/models/data`: every balance equals the sum of its ledger entries, ids are unique, locks match open orders and pending withdrawals, amounts fit their decimals |
| `npm run boards` | Cuts each design board out of the PDFs as a JPEG plus its text layer, into `.boards/` (git-ignored) |
| `npm run shots -- --as=demo /wallet` | Screenshots pages at 1440 and 390 px into `.screenshots/` (git-ignored), with Playwright; `--fresh` resets the demo data first |
| `npm run compare -- /markets screens-p03-markets` | Compares a page's text positions and sizes with a board's text layer (from `npm run boards`) and flags anything more than a few px off |
| `npm run vendor` | Copies the fonts and the QR encoder out of `node_modules` into `client/assets` (the copies are committed) |

## How it fits together

```text
client/
├── index.html           the one page shell
├── assets/              fonts, favicon, icons, vendored QR encoder
├── styles/              tokens.css (section 7), base.css, components/, pages/
└── src/
    ├── app/             router, routes, guards, start-up
    ├── models/          api/ (one client per API group, and mock/: the fake backend),
    │                    data/ (seed JSON), realtime/ (socket), domain/ (money and rules), stores/
    ├── presenters/      one per page or widget: calls models, formats, returns { vm, actions }
    └── views/           layouts/, pages/, components/: build the DOM from vm and actions
server/                  reserved for the Node/Express API
scripts/                 tooling: data check, board extraction, screenshots, vendored files
```

- **Model, View, Presenter.** Views never import models and never format numbers or dates; only page and layout modules call presenters. Money stays a decimal string and is calculated only in `models/domain/money.js`, with BigInt.
- **The mock backend** (`client/src/models/api/mock`) answers the same endpoints, with the same `{ success, data }` envelope, as section 4 of the plan. It holds a market simulator (a market-maker ladder, a bot taker, tickers and candles), a matching engine (pending, then open or filled, with ledger entries for every lock, fill, fee and unlock) and a socket gateway. When the Express API exists, `models/api/http.js` points at it and the `mock` folder is deleted.
- **Demo data** is seeded from the JSON in `client/src/models/data`, shaped like the API's DTOs. On the first visit (or a reset) every timestamp moves forward so the newest lands just before now, and the result is saved in `localStorage`, so the account ages like a live one. Prices restart from the boards' values on each page load.

## Not built yet

- Stretch pages (coin detail, convert, alerts, notifications, password reset, email verification page, admin assets and audit logs) show a "not built yet" page.
- Google sign-in, the OAuth callback and card deposits need the backend.
- The dark theme isn't designed; the theme toggle stays, and the tokens are ready for a dark set.
