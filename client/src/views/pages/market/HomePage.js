// HomePage (section 5; board Home · signed out).

import { h } from '../../dom.js';
import { mountView } from '../../mountView.js';
import { createHomePresenter } from '/src/presenters/market/home.presenter.js';
import { HeroSection } from '../../components/home/HeroSection.js';
import { TickerStrip } from '../../components/home/TickerStrip.js';
import { TopMoversCard } from '../../components/home/TopMoversCard.js';
import { FeatureGrid } from '../../components/home/FeatureGrid.js';
import { CtaBanner } from '../../components/home/CtaBanner.js';

export const styles = ['/styles/components/ladder.css', '/styles/pages/home.css'];
export const title = () => 'Simulated spot exchange';

function HomeView(vm, actions) {
  return h('div', { class: 'home' },
    HeroSection(vm, actions),
    TickerStrip(vm.strip),
    h('section', { class: 'movers container', 'aria-labelledby': 'movers-title' },
      h('div', { class: 'home-heading-row' },
        h('h2', { class: 'home-heading', id: 'movers-title' }, 'The last 24 hours'),
        h('a', { class: 'link', href: '/markets' }, 'All markets')),
      h('div', { class: 'movers-grid' },
        TopMoversCard({ id: 'gainers', label: 'Gainers', rows: vm.movers.gainers, kind: 'change', empty: 'Nothing is up on the day.' }),
        TopMoversCard({ id: 'losers', label: 'Losers', rows: vm.movers.losers, kind: 'change', empty: 'Nothing is down on the day.' }),
        TopMoversCard({ id: 'traded', label: 'Most traded', rows: vm.movers.traded, kind: 'volume', empty: 'No trades yet.' }))),
    FeatureGrid(),
    vm.signedIn ? null : CtaBanner());
}

export function mount(outlet) {
  return mountView(outlet, createHomePresenter(), HomeView);
}
