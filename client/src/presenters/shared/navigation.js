// Lets a presenter move to another page (after login, logout, a form) without
// importing the router: the router listens for this event.

export function navigate(to, { replace = false } = {}) {
  dispatchEvent(new CustomEvent('app:navigate', { detail: { to, replace } }));
}

/** Rewrites the address bar without loading a page (the OAuth callback clears ?error= and #ticket=). */
export function tidyAddress(to) {
  history.replaceState(history.state, '', to);
}

/** One step back in the browser's history, as the Back button does (closing a drawer a link opened). */
export function back() {
  history.back();
}
