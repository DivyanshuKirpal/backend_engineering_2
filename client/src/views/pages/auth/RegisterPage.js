// RegisterPage (section 5; board Register): the sign-up form with the
// password meter, beside the brand panel's "10,000 USDT".

import { render } from '../../dom.js';
import { createRegisterPresenter } from '/src/presenters/auth/register.presenter.js';
import { RegisterForm } from '../../components/auth/RegisterForm.js';
import { RegisterAside } from '../../components/auth/AuthParts.js';

export const styles = ['/styles/pages/auth.css'];
export const title = () => 'Create a demo account';

export function mount(outlet, route, layout) {
  const presenter = createRegisterPresenter({ next: route.query.next });
  const draw = () => render(outlet, RegisterForm(presenter.vm, presenter.actions));
  draw();
  if (layout?.aside) render(layout.aside, RegisterAside());
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    if (layout?.aside) render(layout.aside);
    render(outlet);
  };
}
