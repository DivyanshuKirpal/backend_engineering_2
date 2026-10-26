// useLegalPresenter (section 5, LegalPage): the terms, privacy and risk
// pages (/legal/:slug). Each says first that Orichal is a simulator (section
// 2: "states that the exchange is simulated").

import { createPresenter } from '../shared/presenter.js';

const UPDATED = '26 Oct 2026';
const SIMULATOR = 'Orichal is a simulator built for a course project. Nothing on it is real money, and nothing here is an offer of financial services.';

const DOCS = {
  terms: {
    label: 'Terms of use',
    sections: [
      { heading: 'What Orichal is', body: ['A simulated spot exchange for BTC, ETH, SOL and BNB against USDT. Every new account starts with 10,000 demo USDT. Prices follow a public market feed, or a random walk when the feed is offline, and orders match in a simulated engine.'] },
      { heading: 'Your account', body: ['Keep your password and your authenticator to yourself, and use one account each. An admin may freeze an account that abuses the simulator, for example by flooding it with orders; a frozen account can still log in and look.'] },
      { heading: 'Demo funds', body: ['Demo USDT and demo coins have no value. They can\'t be bought, sold or sent anywhere real: deposits and withdrawals only move numbers inside Orichal, and every address is simulated.'] },
      { heading: 'Identity checks', body: ['Send a sample document, never your real ID. An admin reviews it so the withdrawal flow can be shown from start to finish.'] },
      { heading: 'Resets and changes', body: ['The demo data can be reset, which puts every balance, order and identity check back to where it started. These terms can change as the project does; the date above says when they last did.'] },
    ],
  },
  privacy: {
    label: 'Privacy',
    sections: [
      { heading: 'What is kept', list: ['Your email, display name and preferences.', 'Your orders, trades and the ledger behind your balances.', 'The devices you sign in from, with their IP addresses, and security events such as a wrong password.', 'Your identity check, keeping only the last four characters of the document number.'] },
      { heading: 'Why', body: ['To run the simulator: to sign you in, keep your balances right, and show admins what they need to review.'] },
      { heading: 'Who sees it', body: ['You, and the project\'s admins. Opening an identity document is written to the audit log every time.'] },
      { heading: 'In this version', body: ['This version runs without a server, so everything lives in your browser\'s local storage. Clearing the site\'s data, or Reset demo data, removes it.'] },
      { heading: 'Your choices', body: ['Change your display name and preferences on your profile, sign out other devices under Security, or ask an admin to delete your account.'] },
    ],
  },
  risk: {
    label: 'Risk notice',
    sections: [
      { heading: 'No real money', body: ['Gains and losses here aren\'t real, and nothing on Orichal is advice to buy or sell anything.'] },
      { heading: 'Real markets are harder', body: ['Real crypto prices can move fast. A real exchange can halt, an order can fill at a worse price than you expected, and fees add up. A simulator can only show some of that.'] },
      { heading: 'Practice, not prediction', body: ['Use Orichal to learn how orders, the order book and the ledger work. How you do here says little about how you would do with real money.'] },
    ],
  },
};

export function createLegalPresenter({ slug }) {
  const p = createPresenter();
  const doc = DOCS[slug] ?? null;
  return {
    get vm() {
      return {
        found: Boolean(doc),
        tabs: Object.entries(DOCS).map(([key, d]) => ({ key, label: d.label, href: `/legal/${key}`, current: key === slug })),
        title: doc?.label ?? 'Legal',
        updated: `Last changed ${UPDATED}`,
        simulator: SIMULATOR,
        sections: doc?.sections.map((sec, i) => ({ key: String(i), ...sec })) ?? [],
      };
    },
    actions: {},
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}

export const legalTitle = (slug) => DOCS[slug]?.label ?? 'Legal';
