// FeatureGrid (section 5): how the exchange works, in six cells.

import { h } from '../../dom.js';

const FEATURES = [
  ['01', 'Price first, then time', 'Orders at the same price fill in the order they arrived. The ladder shows each price as a queue, with your orders marked.'],
  ['02', 'Every move on the ledger', 'Locks, fills and fees each write a ledger entry. Your balance is always the sum of those entries, and you can read every one.'],
  ['03', 'Live, then checked', 'The book, trades and candles stream as they happen. If your connection drops, the page reloads them from the source instead of guessing.'],
  ['04', 'Always someone to trade with', 'A market-maker bot quotes five price levels on each side of every market, so your order has a counterparty day and night.'],
  ['05', 'Practice money, real mechanics', 'Deposits and withdrawals are simulated end to end, including fees, minimums and an admin review before money leaves.'],
  ['06', 'Two-factor sign-in', 'Turn on authenticator codes, sign in with Google, and see every device that holds a session. Sign any of them out in one click.'],
];

export function FeatureGrid() {
  return h('section', { class: 'features container', 'aria-labelledby': 'features-title' },
    h('h2', { class: 'home-heading', id: 'features-title' }, 'How the exchange works'),
    h('ol', { class: 'feature-grid plain' }, FEATURES.map(([n, title, body]) => h('li', { class: 'feature' },
      h('span', { class: 'feature-number t-mono', 'aria-hidden': 'true' }, n),
      h('h3', { class: 'feature-title' }, title),
      h('p', { class: 'feature-body' }, body)))));
}
