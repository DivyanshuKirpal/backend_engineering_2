// App start (section 1, App): restore the session, mount the toaster, then let
// the router draw the page the address asks for.

import { restoreSession } from '/src/presenters/shared/session.presenter.js';
import { toastList, dismissToast } from '/src/presenters/shared/toasts.js';
import { render } from '/src/views/dom.js';
import { Toaster } from '/src/views/components/ui/Toaster.js';
import { start } from './router.js';

const toasts = document.getElementById('toasts');
const drawToasts = () => render(toasts, Toaster({ items: toastList.get().items }, { dismiss: dismissToast }));
toastList.subscribe(drawToasts);
drawToasts();

addEventListener('unhandledrejection', (e) => console.error('[orichal]', e.reason));

await restoreSession();
start(document.getElementById('app'));
