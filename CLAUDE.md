# Orichal: standing rules

Orichal is a simulated crypto exchange for a course project. This phase builds the frontend only, on static data.

## Sources of truth

- `architecture_declaration/crypto-exchange-architecture-declaration (1).md`, revision 3. Section 2 routes, sections 3 and 4 data shapes (schemas, DTOs, the `{ success, data }` envelope), section 5 layouts and components, Overview and section 6 the MVP rules, section 7 the UI design. Section 8 is this phase's build log.
- `ui_design/Orichal (1).pdf` holds the 20 screen boards; `ui_design/Orichal.pdf` holds AppHeader, AppFooter, AdminSidebar and the UI kit. The page index is in md section 8.
- Section 7 wins on exact values (hex codes, sizes, token names). The PDF wins on layout, copy, numbers and states. When they disagree, follow the PDF for looks and the md for behaviour, and log the conflict in section 8.
- File names hold spaces and brackets: always quote the paths.
- pdftoppm isn't installed, so PDF page ranges fail. `npm run boards` writes one JPEG per board to `.boards/` (git-ignored); open single boards from there.
- Before starting a page, reopen its board(s) and the md sections it touches. When it's done, screenshot it at 1440 and 390 px (`npm run shots`), compare with the board and fix what differs. `npm run compare -- <route> <board>` measures text positions and sizes against the board's text layer. Add `--verified` when signed in as the demo trader: their email is unconfirmed, and the banner would push the page 36 px down from its board.
- From Git Bash, prefix those two with `MSYS_NO_PATHCONV=1` (or leave out the route's leading slash), or Bash rewrites `/markets` into a Windows path.

## Scope

- Static phase: no backend, database or Express. `server/` only holds a README.
- HTML, CSS and JavaScript (ES modules), the DOM, events, fetch, Promises, async/await, npm. Node is for tooling only.
- No frameworks or build tools: no React, Vite, Tailwind or jQuery.
- Light theme only. Keep the theme toggle and use tokens everywhere, so a dark set can be added.
- Responsive from 1440 to 390 px. Below 768 px, Trade follows the phone board.
- Accessible: semantic HTML, real buttons and labels, visible focus, colour never the only signal, section 7 contrast rules.
- Times use the real clock in the browser's time zone. Seeding or resetting the demo data shifts every timestamp so the newest lands just before now.

## Folders and layers

- `client/index.html` is the one shell. `client/assets` holds fonts, the favicon, icons and vendored files. `client/styles` holds `tokens.css`, `base.css`, `components/` and `pages/`.
- `client/src/app`: router, routes, guards, start-up.
- `client/src/models`: `api/` (one client per section 4 group; `mock/` is the fake backend, deleted when the server arrives), `data/` (seed JSON in DTO and envelope shape), `realtime/` (socket client), `domain/` (money and rules), `stores/`.
- `client/src/presenters`: one per page or widget. Calls models, formats through `formatters/`, returns `{ vm, actions }`.
- `client/src/views`: `layouts/`, `pages/`, `components/`. Functions of `(vm, actions)` that build DOM through `views/dom.js`.
- Views never import models and never format numbers or dates. Only page and layout modules call presenters.
- Money is a string, computed only with `models/domain/money.js` (BigInt), never with floats. Charts get numbers from their presenter, for drawing only.
- URLs are root-relative (`/styles/…`, `/src/…`), and pages load through dynamic `import()`.

## Working

- Build order: foundations, shared components, then the pages in the order checklisted in md section 8, then the undesigned Core pages (marked undesigned). Stretch pages wait.
- Finish each page fully, give a one-line update and keep going. Ask only when something is unclear or hard to undo.
- Run `npm run check:data` after any change to the static data.
- Commit after each finished page, with a clear message.
- After each file or group of related files that changes something, update md section 8: a dated log entry (what, which files, how), any difference from the md or the PDF and why, the checklist and the component map. Each real change also gets a review-log row in the existing format. Never delete sections 1 to 7; mark what this phase does differently.

## Demo accounts (mock sign-in)

- `demo@orichal.app`, password `orichal-demo`, 2FA code `123456`.
- `admin@orichal.app` (Rohan Sethi), password `orichal-demo`, no 2FA.
