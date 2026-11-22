// The exchange's life cycle: start-up and the demo reset. Split out of the
// mock's server.js; its routes went to view/routes/index.js, its socket
// gateway to view/sockets/gateway.js and its demo controls to
// presenter/handlers/demo.js.
//
// Start-up opens the store, loads the market simulator, starts its timers and
// lets the engine apply any order still pending, as after a restart. A reset
// does the same over fresh seed data. Every API request first awaits
// whenReady(), so none reaches an exchange halfway through a reset.

import * as store from '../store.js';
import * as engine from './engine.js';
import * as market from './market.js';
import * as session from './session.js';

let ready = null;

export function start() {
  ready ??= (async () => {
    await store.open();
    await market.init();
    market.start();
    engine.replayPending();
  })();
  return ready;
}

export const whenReady = () => ready ?? start();

/** Throws the demo data away and loads it again from the seed files, for everyone. */
export async function reset() {
  await whenReady();
  ready = (async () => {
    market.clear();
    session.forgetAll();
    await store.reset();
    await market.init();
    market.start();
    engine.replayPending();
  })();
  return ready;
}

/** On shutdown: the simulator's timers stop and the store is saved at once. */
export function stop() {
  market.stop();
  store.saveNow();
}
