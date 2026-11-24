// The Express application: which middleware runs, and in which order.
// server.js hands it to an HTTP server. Each request walks down this list
// until something answers it, so the order is the design:
//   1. helmet          security headers on every response
//   2. morgan          one log line per API request
//   3. express.json    a JSON body (up to 100 kb) becomes req.body
//   4. cookie-parser   the Cookie header becomes req.cookies
//   5. /api/v1         the API
//   6. /api            any other API path: a JSON 404, never the HTML page
//   7. static files    client/: index.html, styles, scripts, fonts, data
//   8. fallback        any other GET gets index.html; the client's router
//                      reads the address and draws the page
//   9. errorHandler    last, so it catches errors from everything above

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { apiRouter } from './view/routes/index.js';

const clientDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client');

// The browser may keep a copy of each file but must ask the server whether it
// changed before using it (a 304 answer if it didn't), as client/serve.json had it.
const NO_CACHE = 'no-cache';

export const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Helmet's default asks the browser to fetch everything over https.
      // Over plain http://localhost, Safari would then fail to load anything.
      upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      // Helmet's default, plus blob: for the admin's identity images. They need
      // the access token, so the page fetches them and draws its own copy.
      imgSrc: ["'self'", 'data:', 'blob:'],
    },
  },
}));
// Only API requests: the client's files would add a few hundred lines per page load.
app.use(morgan('dev', { skip: (req) => !req.originalUrl.startsWith('/api') }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api/v1', apiRouter);
app.use('/api', notFound);

app.use(express.static(clientDir, {
  cacheControl: false,
  setHeaders: (res) => res.setHeader('Cache-Control', NO_CACHE),
  // A folder name such as /styles falls through to index.html instead of
  // redirecting to /styles/, as with serve.
  redirect: false,
}));

// Express 5 writes "any path" as a named wildcard; {} makes it optional, so
// it matches / too.
app.get('/{*splat}', (req, res) => {
  res.sendFile('index.html', { root: clientDir, headers: { 'Cache-Control': NO_CACHE } });
});

app.use(errorHandler);
