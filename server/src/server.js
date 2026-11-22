// Starts Orichal: reads the settings, then serves the Express app on PORT
// through Node's own HTTP module. The HTTP server is created here instead of
// with app.listen() because Socket.IO (M2) attaches to this same server, so
// the page, the API and the live events share one port and one origin.

import { createServer } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';

const server = createServer(app);

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
