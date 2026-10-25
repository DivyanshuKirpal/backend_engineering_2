// The live order book of section 6, flow C, for any presenter that shows one:
// subscribe to market:{symbol} first and buffer deltas, then load the
// snapshot (it carries seq), drop older deltas and apply the rest in order.
// A gap in seq, or a reconnect, starts again from the snapshot.

import * as marketApi from '../../models/api/market.api.js';
import * as bookModel from '../../models/domain/orderBook.model.js';
import { socket } from '../../models/realtime/socket.js';

export function createLiveBook(symbol, onChange, { depth = 50 } = {}) {
  let book = bookModel.createBook();
  let status = 'loading';
  let error = null;
  let disposed = false;
  let loading = false;

  async function load() {
    if (loading || disposed) return;
    loading = true;
    book = bookModel.createBook();
    try {
      const snapshot = await marketApi.orderbook(symbol, depth);
      if (disposed) return;
      if (bookModel.load(book, snapshot) === 'gap') {
        loading = false;
        load();
        return;
      }
      status = 'ready';
      error = null;
    } catch (err) {
      status = 'error';
      error = err;
    }
    loading = false;
    if (!disposed) onChange();
  }

  const offRoom = socket.subscribe(`market:${symbol}`);
  const offDelta = socket.on('orderbook', (delta) => {
    if (delta.symbol !== symbol || disposed) return;
    if (loading || book.seq == null) {
      bookModel.buffer(book, delta);
      return;
    }
    if (bookModel.apply(book, delta) === 'gap') load();
    else onChange();
  });
  const offReconnect = socket.on('reconnect', () => load());
  load();

  return {
    get status() { return status; },
    get error() { return error; },
    side: (which, n) => bookModel.side(book, which, n),
    best: () => bookModel.best(book),
    retry: load,
    dispose() {
      disposed = true;
      offRoom();
      offDelta();
      offReconnect();
    },
  };
}
