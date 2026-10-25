# server/

Reserved for the Node 22 + Express 5 API and the matching engine described in the architecture doc (sections 1, 3, 4 and 6 of `architecture_declaration/crypto-exchange-architecture-declaration (1).md`): `server.js` for the REST API and the Socket.IO gateway, `engine.js` for matching and market data, MongoDB and Redis behind them.

Nothing lives here yet. In the static frontend phase, `client/src/models/api/mock/` stands in for this server: it answers the same endpoints with the same response envelope and DTOs, and pushes the same socket events. When the API is built here:

1. Point `TRANSPORT` in `client/src/models/api/http.js` at `fetchTransport`.
2. Make `client/src/models/realtime/socket.js` wrap a Socket.IO client.
3. Delete `client/src/models/api/mock/`.

Presenters and views don't change.
