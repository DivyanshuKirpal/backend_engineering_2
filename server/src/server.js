// Starts Orichal: reads the settings, opens the store and starts the exchange
// (the market simulator and the matching engine), then serves the Express app
// on PORT through Node's own HTTP module. The HTTP server is created here
// instead of with app.listen() because Socket.IO attaches to this same server,
// so the page, the API and the live events share one port and one origin.

import { createServer } from 'node:http';
import { app } from './app.js';
import { connectDb, explainConnection } from './config/db.js';
import { env } from './config/env.js';
import * as lifecycle from './model/exchange/lifecycle.js';
import { attachGateway } from './view/sockets/gateway.js';

// The app still runs on the JSON store, so a missing database isn't fatal yet.
connectDb().catch((err) => console.error(explainConnection(err)));

await lifecycle.start();

const server = createServer(app);
attachGateway(server);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${env.PORT} is already in use. Stop the other server (another npm run dev?) or set PORT in server/.env.`);
    process.exit(1);
  }
  throw err;
});

server.listen(env.PORT, () => {
  console.log(`Orichal is listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Ctrl+C in the terminal (SIGINT) or a stop signal (SIGTERM): save the store
// at once, rather than waiting for its 200 ms timer, then exit.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    lifecycle.stop();
    console.log(`${signal}: the store is saved to ${env.STORE_FILE}.`);
    process.exit(0);
  });
}
