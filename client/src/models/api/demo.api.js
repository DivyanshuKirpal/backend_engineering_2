// The Simulator menu's demo controls (navbar presenter), over the server's demo
// routes. The server mounts them only while it runs with DEMO_CONTROLS=true.

import { post } from './http.js';

/** Throws the demo data away and seeds it again: on the server, so for every browser. */
export const reset = () => post('/demo/reset');

/** The next API request from this browser answers 503, to show a page's error state. */
export const failNextRequest = () => post('/demo/fail-next');
