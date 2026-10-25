// Toasts (section 7, UI kit): presenters push one, the Toaster view shows the
// list. A toast is { id, title, body?, mono?, tone: 'success' | 'error' | 'info' }.

import { createStore } from '../../models/stores/createStore.js';

export const toastList = createStore({ items: [] });
let next = 0;

export function toast({ title, body = '', mono = false, tone = 'info', duration = 5000 }) {
  const id = ++next;
  toastList.set((s) => ({ items: [...s.items, { id, title, body, mono, tone }].slice(-4) }));
  if (duration) setTimeout(() => dismissToast(id), duration);
  return id;
}

export function dismissToast(id) {
  toastList.set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
}

/** A toast for a failed request, with the API's message when it has one. */
export function errorToast(title, error) {
  return toast({ title, body: error?.message ?? 'Something went wrong. Try again.', tone: 'error' });
}
