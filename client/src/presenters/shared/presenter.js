// Plumbing every presenter shares. A presenter holds state, builds a view
// model from it and exposes { vm, actions } (section 6, rule 2) plus
// subscribe() and dispose(). Several changes in one tick cause one redraw.

export function createPresenter() {
  const listeners = new Set();
  const cleanups = [];
  let queued = false;
  let disposed = false;

  return {
    /** Call after any state change; listeners run once per tick. */
    changed() {
      if (queued || disposed) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!disposed) for (const fn of [...listeners]) fn();
      });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Registers clean-up (store and socket unsubscriptions, timers). */
    own(cleanup) {
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      return cleanup;
    },
    dispose() {
      disposed = true;
      listeners.clear();
      for (const fn of cleanups.splice(0)) fn();
    },
    get disposed() {
      return disposed;
    },
  };
}

/** Runs `fn` every `ms` until the presenter is disposed. */
export function every(p, ms, fn) {
  const id = setInterval(fn, ms);
  p.own(() => clearInterval(id));
  return id;
}
