// HeroSection (section 5; Home · signed out board): the pitch on the left,
// a live BTC/USDT ladder card with a sample order on the right.

import { h } from '../../dom.js';
import { OrderBook } from '../trade/OrderBook.js';
import { PriceChange } from '../market/PriceChange.js';
import { Skeleton, ErrorState } from '../ui/EmptyState.js';

function LadderCard(hero, onRetry) {
  if (hero.status !== 'ready') {
    return h('section', { class: 'hero-card', 'aria-label': 'BTC/USDT price ladder' },
      hero.status === 'error' ? ErrorState({ title: 'The live ladder didn\'t load', onRetry }) : Skeleton({ lines: 10, label: 'Loading the live ladder' }));
  }
  return h('section', { class: 'hero-card', 'aria-labelledby': 'hero-ladder-title' },
    h('div', { class: 'hero-card-head' },
      h('h2', { class: 'panel-label', id: 'hero-ladder-title' }, hero.title),
      PriceChange(hero.change, { className: 'hero-card-change' })),
    OrderBook(hero, { caption: 'BTC/USDT order book, live, with a sample buy order marked as yours' }),
    h('ol', { class: 'hero-timeline', 'aria-label': 'The sample order so far' }, hero.timeline.map((step) => h('li', { key: step.key, class: `hero-step hero-step-${step.state}` },
      h('span', { class: 'hero-step-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'hero-step-label' }, step.label),
      h('span', { class: step.state === 'done' ? 'hero-step-time t-mono' : 'hero-step-wait' }, step.detail)))),
    h('p', { class: 'hero-ledger t-mono' },
      `ledger · ${hero.ledger.type} · ${hero.ledger.asset} `,
      h('strong', {}, hero.ledger.free), ' free, ', h('strong', {}, hero.ledger.locked), ' locked'));
}

export function HeroSection(vm, actions) {
  return h('section', { class: 'hero container', 'aria-labelledby': 'hero-title' },
    h('div', { class: 'hero-copy' },
      h('p', { class: 'eyebrow' }, 'Simulated spot exchange · demo funds'),
      h('h1', { class: 'hero-title', id: 'hero-title' }, 'Trade on an engine you can see into.'),
      h('p', { class: 'hero-lede' }, 'Practise buying and selling BTC, ETH, SOL and BNB against USDT with 10,000 demo USDT. Every order shows its place in the book, its fills and the ledger entries it writes.'),
      h('div', { class: 'hero-actions' },
        vm.signedIn
          ? h('a', { class: 'btn btn-primary btn-lg', href: '/trade/BTC-USDT' }, 'Open the trade screen')
          : h('a', { class: 'btn btn-primary btn-lg', href: '/register' }, 'Create a demo account'),
        h('a', { class: 'btn btn-secondary btn-lg', href: '/markets' }, 'Browse markets')),
      vm.signedIn ? null : h('p', { class: 'hero-note' }, 'No card and no real money. New accounts start with 10,000 USDT.')),
    LadderCard(vm.hero, actions.retry));
}
