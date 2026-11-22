// The API's router, mounted on /api/v1 by app.js. For now it holds one route,
// GET /health. In M2 this file becomes the adapter that mounts the handler
// tables moved from the mock backend.

import { Router } from 'express';
import { ok } from '../http/respond.js';

export const apiRouter = Router();

// GET /api/v1/health: the server process is up and answering. From M3 it
// also says whether MongoDB is reachable.
apiRouter.get('/health', (req, res) => {
  ok(res, {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});
