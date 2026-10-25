// Every route in section 2: 33 pages on 34 routes. Access is public (anyone),
// guest (logged-out only), user (logged in) or admin (role admin). Each page
// module loads with a dynamic import() when its route is first opened.

const page = (path) => () => import(`/src/views/pages/${path}`);
const notBuilt = (name) => () => import('/src/views/pages/info/NotBuiltPage.js').then((m) => m.forPage(name));

export const routes = [
  // Public
  { path: '/', title: 'Simulated spot exchange', layout: 'public', access: 'public', load: page('market/HomePage.js') },
  { path: '/markets', title: 'Markets', layout: 'public', access: 'public', load: page('market/MarketsPage.js') },
  { path: '/coins/:code', title: 'Coin', layout: 'public', access: 'public', load: notBuilt('Coin detail'), stretch: true },
  { path: '/trade/:symbol', title: 'Trade', layout: 'trade', access: 'public', load: page('trade/TradePage.js') },
  { path: '/fees', title: 'Fees', layout: 'public', access: 'public', load: page('info/FeesPage.js') },
  { path: '/legal/:slug', title: 'Legal', layout: 'public', access: 'public', load: page('info/LegalPage.js') },

  // Sign-in
  { path: '/login', title: 'Log in', layout: 'auth', access: 'guest', load: page('auth/LoginPage.js') },
  { path: '/register', title: 'Create a demo account', layout: 'auth', access: 'guest', load: page('auth/RegisterPage.js') },
  { path: '/forgot-password', title: 'Forgot password', layout: 'public', access: 'guest', load: notBuilt('Forgot password'), stretch: true },
  { path: '/reset-password', title: 'Reset password', layout: 'public', access: 'guest', load: notBuilt('Reset password'), stretch: true },
  { path: '/verify-email', title: 'Verify email', layout: 'public', access: 'public', load: notBuilt('Verify email'), stretch: true },
  { path: '/oauth/callback', title: 'Signing in with Google', layout: 'auth', access: 'public', load: page('auth/OAuthCallbackPage.js') },

  // Logged in
  { path: '/convert', title: 'Convert', layout: 'public', access: 'user', load: notBuilt('Convert'), stretch: true },
  { path: '/wallet', title: 'Wallet', layout: 'public', access: 'user', load: page('wallet/WalletPage.js') },
  { path: '/wallet/deposit', title: 'Deposit', layout: 'public', access: 'user', load: page('wallet/DepositPage.js') },
  { path: '/wallet/withdraw', title: 'Withdraw', layout: 'public', access: 'user', load: page('wallet/WithdrawPage.js') },
  { path: '/wallet/history', title: 'History', layout: 'public', access: 'user', load: page('wallet/TransactionsPage.js') },
  { path: '/orders', title: 'Orders', layout: 'public', access: 'user', load: page('orders/OrdersPage.js') },
  { path: '/alerts', title: 'Price alerts', layout: 'public', access: 'user', load: notBuilt('Price alerts'), stretch: true },
  { path: '/notifications', title: 'Notifications', layout: 'public', access: 'user', load: notBuilt('Notifications'), stretch: true },
  { path: '/account', redirect: '/account/profile', access: 'user' },
  { path: '/account/profile', title: 'Profile', layout: 'account', access: 'user', load: page('account/ProfilePage.js') },
  { path: '/account/security', title: 'Security', layout: 'account', access: 'user', load: page('account/SecurityPage.js') },
  { path: '/account/verification', title: 'Verification', layout: 'account', access: 'user', load: page('account/VerificationPage.js') },

  // Admin
  { path: '/admin', title: 'Admin · Dashboard', layout: 'admin', access: 'admin', load: page('admin/AdminDashboardPage.js') },
  { path: '/admin/users', title: 'Admin · Users', layout: 'admin', access: 'admin', load: page('admin/AdminUsersPage.js') },
  { path: '/admin/users/:id', title: 'Admin · User', layout: 'admin', access: 'admin', load: page('admin/AdminUserDetailPage.js') },
  { path: '/admin/kyc', title: 'Admin · KYC review', layout: 'admin', access: 'admin', load: page('admin/AdminKycPage.js') },
  { path: '/admin/withdrawals', title: 'Admin · Withdrawals', layout: 'admin', access: 'admin', load: page('admin/AdminWithdrawalsPage.js') },
  { path: '/admin/markets', title: 'Admin · Markets', layout: 'admin', access: 'admin', load: page('admin/AdminMarketsPage.js') },
  { path: '/admin/assets', title: 'Admin · Assets', layout: 'admin', access: 'admin', load: notBuilt('Admin assets'), stretch: true },
  { path: '/admin/audit-logs', title: 'Admin · Audit logs', layout: 'admin', access: 'admin', load: notBuilt('Admin audit logs'), stretch: true },
  { path: '/admin/system', title: 'Admin · System', layout: 'admin', access: 'admin', load: page('admin/AdminSystemPage.js') },

  // Anything else
  { path: '*', title: 'Page not found', layout: 'public', access: 'public', load: page('info/NotFoundPage.js') },
];

/** Finds the route for a pathname: `{ route, params }`. */
export function match(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const route of routes) {
    if (route.path === '*') continue;
    const names = [];
    const pattern = new RegExp(`^${route.path.replace(/:(\w+)/g, (_, n) => {
      names.push(n);
      return '([^/]+)';
    })}$`);
    const m = pattern.exec(clean);
    if (m) return { route, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return { route: routes.find((r) => r.path === '*'), params: {} };
}
