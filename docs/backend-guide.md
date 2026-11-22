# The Orichal server: a guide for the viva

This guide explains the server built in the CE-2 phase, for a teammate getting ready for the viva. It grows by one section per milestone, written when that milestone is finished and pushed, so every section describes code that exists and runs. The plan behind the work is [`docs/server-plan.md`](server-plan.md); the browser side is explained in [`docs/frontend-guide.md`](frontend-guide.md). At M10 this guide gains two traces through the code, a file-by-file list, the course-topic map and a glossary.

## Contents

1. [M0. The plan in the repo](#m0-the-plan-in-the-repo)

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
