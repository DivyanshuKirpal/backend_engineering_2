// A small History API router for the routes in routes.js. Same-origin links
// navigate without a page load; each page module is imported when first
// needed; a layout stays mounted while pages that share it change; a change of
// query alone (e.g. ?tab=) goes to the page's update() when it has one.

import { match } from './routes.js';
import { guard } from './guards.js';
import { onSessionChange, sessionState } from '/src/presenters/shared/session.presenter.js';
import { toast } from '/src/presenters/shared/toasts.js';
import { render } from '/src/views/dom.js';
import { PageLoading, PageError } from '/src/views/components/ui/PageStates.js';
import { loadStyle } from '/src/views/loadStyle.js';

const LAYOUTS = {
  public: () => import('/src/views/layouts/PublicLayout.js'),
  trade: () => import('/src/views/layouts/TradeLayout.js'),
  account: () => import('/src/views/layouts/AccountLayout.js'),
  admin: () => import('/src/views/layouts/AdminLayout.js'),
  auth: () => import('/src/views/layouts/AuthLayout.js'),
};

let root = null;
let layout = null; // { name, instance }
let page = null; // { pattern, params, unmount, update }
let token = 0;

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function start(element) {
  root = element;
  document.addEventListener('click', onLinkClick);
  addEventListener('popstate', () => resolve());
  addEventListener('app:navigate', (e) => go(e.detail.to, e.detail));
  // A logout (here or in another tab) may close the page that is open. After a
  // login, the presenter that signed in decides where to go.
  let last = sessionState().status;
  onSessionChange((s) => {
    if (s.status === last) return;
    const wasUser = last === 'user';
    last = s.status;
    if (wasUser && s.status === 'guest') resolve({ quiet: true });
  });
  resolve({ initial: true });
}

function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.dataset.external !== undefined) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  // In-page anchors (the skip link) stay with the browser.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  e.preventDefault();
  go(url.pathname + url.search + url.hash);
}

export function go(to, { replace = false } = {}) {
  const url = new URL(to, location.href);
  const next = url.pathname + url.search + url.hash;
  if (next !== location.pathname + location.search + location.hash) {
    history[replace ? 'replaceState' : 'pushState']({}, '', next);
  }
  resolve();
}

async function resolve({ initial = false, quiet = false } = {}) {
  const mine = ++token;
  const url = new URL(location.href);
  const { route, params } = match(url.pathname);

  if (route.redirect) return go(route.redirect, { replace: true });
  const verdict = guard(route, url);
  if (verdict) {
    if (verdict.message) toast({ title: verdict.message, tone: 'error' });
    return go(verdict.redirect, { replace: true });
  }

  const ctx = { path: url.pathname, params, query: Object.fromEntries(url.searchParams), title: route.title, pattern: route.path };

  // Same page, new query: let the page update itself.
  if (page && page.pattern === route.path && sameParams(page.params, params)) {
    if (page.update) {
      layout?.instance.setRoute?.(ctx);
      page.update(ctx);
      return;
    }
    if (quiet) return;
  }

  if (!layout || layout.name !== route.layout) {
    page?.unmount?.();
    page = null;
    layout?.instance.unmount();
    layout = null;
    const mod = await LAYOUTS[route.layout]();
    if (mine !== token) return;
    layout = { name: route.layout, instance: mod.mount(root, ctx) };
  } else {
    layout.instance.setRoute?.(ctx);
  }

  page?.unmount?.();
  page = null;
  const outlet = layout.instance.outlet;
  render(outlet, PageLoading());

  let mod;
  try {
    mod = await route.load();
    if (mod.styles) await Promise.all(mod.styles.map(loadStyle));
  } catch (err) {
    if (mine !== token) return;
    console.error(err);
    render(outlet, PageError({ title: 'This page didn\'t load', body: 'Check the connection and try again.', onRetry: () => resolve() }));
    return;
  }
  if (mine !== token) return;

  try {
    const result = mod.mount(outlet, ctx, layout.instance);
    page = {
      pattern: route.path,
      params,
      unmount: typeof result === 'function' ? result : result?.unmount,
      update: typeof result === 'object' ? result?.update : undefined,
    };
  } catch (err) {
    console.error(err);
    render(outlet, PageError({ title: 'Something went wrong on this page', body: String(err?.message ?? err), onRetry: () => resolve() }));
    page = { pattern: route.path, params };
  }

  document.title = `${mod.title?.(ctx) ?? route.title} · Orichal`;
  if (!initial) {
    if (!url.hash) scrollTo(0, 0);
    // Move focus to the new page's heading, so screen readers announce it.
    requestAnimationFrame(() => {
      const heading = outlet.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    });
  }
}
