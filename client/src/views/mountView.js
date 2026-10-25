// Wires a presenter to a view function: draws once, redraws on every change,
// and cleans both up when the page closes. Page modules call it after creating
// their presenter (only pages and layouts call presenters).

import { render } from './dom.js';

export function mountView(outlet, presenter, View, extra) {
  const draw = () => render(outlet, View(presenter.vm, presenter.actions, extra));
  draw();
  const off = presenter.subscribe(draw);
  return () => {
    off();
    presenter.dispose();
    render(outlet);
  };
}
