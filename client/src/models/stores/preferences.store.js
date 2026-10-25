// Theme and wallet filter (section 1, preferences.store). Saved in
// localStorage for this browser; a signed-in user's copy also lives on the
// account (PATCH /users/me) and wins when the session restores.

import { createStore } from './createStore.js';

const KEY = 'orichal.prefs';
const DEFAULTS = { theme: 'light', hideSmallBalances: false };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const preferences = createStore(load());

export function setPreferences(patch) {
  preferences.set(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences.get()));
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}
