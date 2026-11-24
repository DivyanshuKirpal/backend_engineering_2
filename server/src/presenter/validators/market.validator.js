// The query strings of the public market routes.

import { z } from 'zod';
import { count, text } from './rules.js';

export const orderbook = z.object({ depth: count(100, 'Depth is 1 to 100 levels.') });

export const candles = z.object({
  interval: text('Unknown interval.', { max: 5 }).optional(),
  limit: count(500, 'One request has 1 to 500 candles.'),
});
