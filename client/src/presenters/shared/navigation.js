// Lets a presenter move to another page (after login, logout, a form) without
// importing the router: the router listens for this event.

export function navigate(to, { replace = false } = {}) {
  dispatchEvent(new CustomEvent('app:navigate', { detail: { to, replace } }));
}
