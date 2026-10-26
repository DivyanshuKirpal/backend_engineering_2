// The mock sign-in's accounts (README, "Demo accounts"). They exist only in
// this static phase: the mock API checks them, and the sign-in pages offer to
// fill them in, so nobody mistakes the demo for a real login.

export const DEMO_ACCOUNTS = [
  { key: 'trader', label: 'Demo trader', email: 'demo@orichal.app', password: 'orichal-demo', code: '123456' },
  { key: 'admin', label: 'Admin, Rohan Sethi', email: 'admin@orichal.app', password: 'orichal-demo', code: null },
];
