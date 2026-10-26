// useCursorList (section 1): a "load more" list over a cursor endpoint. It
// keeps the items loaded so far, the next cursor and, when the API sends one,
// the total. `fetchPage({ cursor, limit })` returns { items, nextCursor, total? }.

import { errorToast } from './toasts.js';

export function createCursorList(p, fetchPage, { limit = 20 } = {}) {
  let items = [];
  let cursor = null;
  let total = null;
  let status = 'idle';
  let loadingMore = false;
  let token = 0;

  async function load({ more = false } = {}) {
    const mine = ++token;
    if (more) loadingMore = true;
    else {
      status = 'loading';
      items = [];
      cursor = null;
      total = null;
    }
    p.changed();
    try {
      const page = await fetchPage({ cursor: more ? cursor : undefined, limit });
      if (mine !== token || p.disposed) return;
      items = more ? [...items, ...page.items] : page.items;
      cursor = page.nextCursor ?? null;
      total = page.total ?? null;
      status = 'ready';
    } catch (err) {
      if (mine !== token || p.disposed) return;
      if (more) errorToast('The older entries didn\'t load', err);
      else status = 'error';
    } finally {
      if (mine === token) loadingMore = false;
      p.changed();
    }
  }

  return {
    get items() { return items; },
    get status() { return status; },
    get total() { return total; },
    get hasMore() { return Boolean(cursor); },
    get loadingMore() { return loadingMore; },
    /** Loads the first page again (after a filter change or a retry). */
    reset: () => load(),
    loadMore() {
      if (cursor && !loadingMore) load({ more: true });
    },
  };
}
