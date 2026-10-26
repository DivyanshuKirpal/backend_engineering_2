// LegalPage (section 5): the terms of use, privacy and risk notice, one at a
// time, each opening with what Orichal is. Not drawn yet.

import { h, render, cx } from '../../dom.js';
import { createLegalPresenter, legalTitle } from '/src/presenters/info/legal.presenter.js';

export const styles = ['/styles/pages/info.css'];
export const title = (route) => legalTitle(route?.params?.slug);

function LegalView(vm) {
  return h('div', { class: 'container page info-page legal-page' },
    h('div', { class: 'page-head' },
      h('h1', { class: 't-title', id: 'legal-title' }, vm.title),
      h('p', {}, vm.updated)),
    h('nav', { class: 'tabs tabs-segment legal-nav', 'aria-label': 'Legal pages' }, vm.tabs.map((t) => h('a', {
      key: t.key,
      class: cx('tab', { current: t.current }),
      href: t.href,
      'aria-current': t.current ? 'page' : null,
    }, t.label))),
    vm.found
      ? h('article', { class: 'panel legal-doc', 'aria-labelledby': 'legal-title' },
        h('p', { class: 'legal-banner' }, vm.simulator),
        vm.sections.map((sec) => [
          h('h2', { key: `h-${sec.key}` }, sec.heading),
          sec.body ? sec.body.map((para, i) => h('p', { key: `${sec.key}-${i}` }, para)) : null,
          sec.list ? h('ul', { key: `l-${sec.key}` }, sec.list.map((item, i) => h('li', { key: i }, item))) : null,
        ]))
      : h('section', { class: 'panel legal-doc' }, h('p', {}, 'There\'s no legal page by that name. Pick one above.')),
    h('p', { class: 'undesigned-note' }, 'Not drawn yet: set in the account pages\' panels.'));
}

export function mount(outlet, route) {
  const presenter = createLegalPresenter({ slug: route.params.slug });
  render(outlet, LegalView(presenter.vm));
  return () => {
    presenter.dispose();
    render(outlet);
  };
}
