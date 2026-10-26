// OAuthCallbackPage (section 5): where Google sends people back. In this
// phase Google sign-in needs the server, so it shows any error Google sent,
// says so, and offers logging in by email. Not drawn yet: built from the
// sign-in cards.

import { h, render } from '../../dom.js';
import { createOAuthCallbackPresenter } from '/src/presenters/auth/oauthCallback.presenter.js';
import { AuthMessage, OAuthAside } from '../../components/auth/AuthParts.js';

export const styles = ['/styles/pages/auth.css'];
export const title = () => 'Signing in with Google';

function CallbackView(vm) {
  return h('div', { class: 'auth-stack auth-stack-plain' },
    AuthMessage(vm),
    h('p', { class: 'undesigned-note' }, 'Not drawn yet: built from the sign-in cards.'));
}

export function mount(outlet, route, layout) {
  const presenter = createOAuthCallbackPresenter({ error: route.query.error, hash: location.hash, path: route.path });
  const draw = () => render(outlet, CallbackView(presenter.vm));
  draw();
  if (layout?.aside) render(layout.aside, OAuthAside());
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    if (layout?.aside) render(layout.aside);
    render(outlet);
  };
}
