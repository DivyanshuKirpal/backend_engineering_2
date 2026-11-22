# server/

The Orichal server: Express 5 serving the client (`client/`) and the REST API (`/api/v1`) from one origin, http://localhost:5173. It is built milestone by milestone as [`docs/server-plan.md`](../docs/server-plan.md) sets out, and [`docs/backend-guide.md`](../docs/backend-guide.md) explains the code. Socket.IO arrives in M2 and MongoDB in M3.

## Run it

You need Node.js 22 or later. From the repository root, in PowerShell:

```powershell
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev` runs `node --watch`, which restarts the server when a file it uses changes; `npm start` runs it once, without watching.

The settings are optional for now. Every variable has a default for local development, so the server starts without a `server/.env`. To change one, copy the example and edit the copy:

```powershell
Copy-Item server/.env.example server/.env
```

`server/.env` is git-ignored; never commit real secrets. A bad value stops the server at start with a message naming the variable.

Check that the API answers (in PowerShell, plain `curl` is a different command, so use `curl.exe` or `Invoke-RestMethod`):

```powershell
curl.exe http://localhost:5173/api/v1/health
Invoke-RestMethod http://localhost:5173/api/v1/health
```

## What is here so far

```text
server/
├── .env.example             every variable, with a safe example value
└── src/
    ├── server.js            Node's HTTP server on PORT, running the Express app
    ├── app.js               the middleware, in order: helmet, morgan, JSON and cookie parsing,
    │                        /api/v1, the API's 404, the client's files, the index.html fallback,
    │                        the error handler
    ├── config/env.js        reads server/.env and checks every variable with Zod
    ├── lib/errors.js        ApiError and the helpers for section 4's error codes
    ├── middleware/
    │   ├── notFound.js      an /api path with no route: 404 NOT_FOUND
    │   └── errorHandler.js  the only writer of error responses
    └── view/
        ├── http/respond.js  the envelope: ok, created, accepted, noContent, fail
        └── routes/index.js  the /api/v1 router: GET /health
```

Until M2 the client still answers its API calls with the mock backend inside the browser (`client/src/models/api/mock/`); Express serves the mock's files with the rest of the client. M2 moves the mock's handlers here, points `client/src/models/api/http.js` at `/api/v1`, and deletes the mock.
