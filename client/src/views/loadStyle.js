// Loads a page's own style sheet once. The router waits for it before the page
// draws, so a page never shows unstyled.

const loading = new Map();

export function loadStyle(href) {
  if (!loading.has(href)) {
    loading.set(href, new Promise((resolve) => {
      const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
      if (existing) {
        resolve();
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    }));
  }
  return loading.get(href);
}
