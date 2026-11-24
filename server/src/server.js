// Starts Orichal: reads the settings, connects to MongoDB and loads the store,
// starts the exchange (the market simulator and the matching engine), then
// serves the Express app
// on PORT through Node's own HTTP module. The HTTP server is created here
// instead of with app.listen() because Socket.IO attaches to this same server,
// so the page, the API and the live events share one port and one origin.

import { createServer } from 'node:http';
import { app } from './app.js';
import { disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import * as lifecycle from './model/exchange/lifecycle.js';
import { attachGateway } from './view/sockets/gateway.js';

try {
  await lifecycle.start();
} catch (err) {
  console.error(`Orichal can't start. ${err.message}`);
  process.exit(1);
}

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

// Ctrl+C in the terminal (SIGINT) or a stop signal (SIGTERM): write what isn't
// saved yet, rather than waiting for the 200 ms timer, then exit.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await lifecycle.stop();
    await disconnectDb();
    console.log(`${signal}: everything is saved.`);
    process.exit(0);
  });
}
