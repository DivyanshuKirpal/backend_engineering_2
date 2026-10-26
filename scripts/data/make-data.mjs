// One-off generator for client/src/models/data/*.json. The demo trader's data is
// written out by hand from the boards; the other 53 people are generated with a
// seeded random generator so the files are stable between runs. Times are on the
// boards' clock (25 Oct 2026, around 14:32), written as UTC; the app shifts them
// when it seeds.
//
// Kept as a record of how the data was made. The committed JSON is the source
// of truth now (npm run check:data guards it), so this writes to a folder you
// name, never over client/src/models/data. Usage: node scripts/data/make-data.mjs <out dir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const m = await import(pathToFileURL(join(root, 'client', 'src', 'models', 'domain', 'money.js')).href);
if (!process.argv[2]) {
  console.error('Name a folder to write to, outside client/src/models/data: node scripts/data/make-data.mjs <out dir>');
  process.exit(1);
}
const out = resolve(process.argv[2]);
if (out === resolve(root, 'client', 'src', 'models', 'data')) {
  console.error('That is the committed data. Write somewhere else and compare.');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------- helpers
let seed = 20261025;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];
const hex = (n) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');
const oid = (head = '66e', tail = '') => (head + hex(24 - head.length - tail.length) + tail).slice(0, 24);
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
const iso = (s) => new Date(s).toISOString();
const addMs = (s, ms) => new Date(new Date(s).getTime() + ms).toISOString();
const envelope = (data) => ({ success: true, data });
const write = (name, data) => {
  writeFileSync(join(out, name), JSON.stringify(envelope(data), null, 2) + '\n');
  console.log(name);
};

const ASSETS = {
  USDT: { decimals: 6 }, BTC: { decimals: 8 }, ETH: { decimals: 8 }, SOL: { decimals: 8 }, BNB: { decimals: 8 },
};
const MARKETS = {
  'BTC-USDT': { base: 'BTC', step: '0.00001' },
  'ETH-USDT': { base: 'ETH', step: '0.0001' },
  'SOL-USDT': { base: 'SOL', step: '0.001' },
  'BNB-USDT': { base: 'BNB', step: '0.001' },
};
const fx = (v, asset) => m.fixed(v, ASSETS[asset].decimals);
const qty = (v, market) => m.fixed(v, m.decimalsOf(MARKETS[market].step));
const price = (v) => m.fixed(v, 2);

// ---------------------------------------------------------------- assets and markets
const assets = [
  ['USDT', 'Tether USD', 6, '1', '10', '10000', 'A dollar-pegged stablecoin. Every Orichal market is priced in it, and new accounts start with 10,000 of it.', '118200000000'],
  ['BTC', 'Bitcoin', 8, '0.0002', '0.001', '1', 'The first cryptocurrency, with a fixed supply of 21 million coins.', '19760000'],
  ['ETH', 'Ethereum', 8, '0.002', '0.01', '10', 'The native coin of the Ethereum network, used to pay for computation on it.', '120400000'],
  ['SOL', 'Solana', 8, '0.01', '0.1', '100', 'The native coin of the Solana network, built for fast, cheap transactions.', '471000000'],
  ['BNB', 'BNB', 8, '0.002', '0.02', '20', 'The native coin of the BNB Chain.', '145900000'],
].map(([code, name, decimals, withdrawFee, minWithdraw, demoDepositLimit, description, circulatingSupply]) => ({
  code, name, decimals,
  iconUrl: `/assets/coins/${code.toLowerCase()}.svg`,
  description, circulatingSupply,
  depositEnabled: true, withdrawEnabled: true,
  withdrawFee, minWithdraw, demoDepositLimit,
  status: 'active',
}));
write('assets.json', { assets });

const ticker = (last, changePct, high, low, volume, quoteVolume) => {
  const open = m.fixed(m.div(last, m.add('1', m.div(changePct, '100', 18)), 18), 2);
  return { last, open, high, low, volume, quoteVolume, changePct };
};
const markets = [
  ['BTC-USDT', 'BTC', 'active', '0.00001', ticker('62140.50', '1.84', '62488.00', '60912.35', '168.37204', '10430315.52')],
  ['ETH-USDT', 'ETH', 'active', '0.0001', ticker('3012.40', '0.92', '3041.10', '2968.25', '1387.6021', '4180190.37')],
  ['SOL-USDT', 'SOL', 'active', '0.001', ticker('142.18', '-2.31', '146.92', '140.37', '13504.118', '1920268.80')],
  ['BNB-USDT', 'BNB', 'halted', '0.001', ticker('588.90', '-0.48', '594.30', '585.12', '1477.305', '870129.70')],
].map(([symbol, baseAsset, status, step, t]) => ({
  symbol, baseAsset, quoteAsset: 'USDT', status,
  tickSize: '0.01', stepSize: step, minQty: step, minNotional: '5',
  makerFeeRate: '0.0008', takerFeeRate: '0.001',
  ticker: t,
}));
write('markets.json', { markets });

// ---------------------------------------------------------------- order books (board snapshot)
const book = (seq, asks, bids) => ({ seq, bids, asks });
write('orderbook.BTC-USDT.json', book(48211,
  [['62141.10', '0.04210'], ['62146.80', '0.18500'], ['62152.00', '0.01500'], ['62171.60', '0.42000'], ['62190.00', '0.05000'], ['62202.70', '0.62000'], ['62215.00', '0.03000'], ['62233.80', '0.84000'], ['62250.00', '0.10000'], ['62264.90', '1.05000'], ['62296.00', '1.26000'], ['62327.10', '1.48000']],
  [['62140.40', '0.12800'], ['62135.00', '0.02500'], ['62109.40', '0.40000'], ['62100.00', '0.25000'], ['62078.30', '0.61000'], ['62060.00', '0.04500'], ['62047.20', '0.83000'], ['62030.00', '0.15000'], ['62016.10', '1.06000'], ['62000.00', '0.36000'], ['61985.00', '1.24000'], ['61950.00', '1.52000']]));
write('orderbook.ETH-USDT.json', book(31877,
  [['3012.60', '0.4120'], ['3014.00', '1.2500'], ['3016.80', '0.0800'], ['3019.50', '2.4000'], ['3022.10', '0.6500'], ['3025.00', '3.1000'], ['3028.40', '0.9500'], ['3031.70', '4.2000'], ['3035.00', '0.3000'], ['3038.20', '5.0500'], ['3041.10', '1.8000']],
  [['3012.20', '0.5600'], ['3010.50', '1.4800'], ['3008.00', '0.2000'], ['3004.70', '2.6000'], ['3000.00', '1.1000'], ['2995.40', '3.4000'], ['2990.00', '0.7500'], ['2985.60', '4.6000'], ['2980.00', '1.4000']]));
write('orderbook.SOL-USDT.json', book(27455,
  [['142.19', '18.400'], ['142.21', '52.000'], ['142.24', '6.500'], ['142.28', '96.000'], ['142.33', '24.000'], ['142.39', '140.000'], ['142.45', '31.500'], ['142.52', '188.000'], ['142.60', '12.000'], ['142.68', '230.000']],
  [['142.17', '22.600'], ['142.15', '61.000'], ['142.12', '9.200'], ['142.08', '104.000'], ['142.03', '28.000'], ['141.98', '152.000'], ['141.90', '15.000'], ['141.85', '196.000'], ['141.78', '40.000'], ['141.70', '244.000']]));
write('orderbook.BNB-USDT.json', book(19004, [], []));

// ---------------------------------------------------------------- public trades (tape)
const tape = (market, rows) => ({ trades: rows.map(([p, q, side, time]) => ({ id: oid('66f3'), price: p, quantity: q, takerSide: side, time: iso(time) })) });
write('trades.BTC-USDT.json', tape('BTC-USDT', [
  ['62140.50', '0.01240', 'buy', '2026-10-25T14:32:07.214Z'],
  ['62140.40', '0.00350', 'sell', '2026-10-25T14:31:52.860Z'],
  ['62141.10', '0.02000', 'buy', '2026-10-25T14:31:30.402Z'],
  ['62138.90', '0.15000', 'sell', '2026-10-25T14:31:04.118Z'],
  ['62138.90', '0.08120', 'sell', '2026-10-25T14:30:41.733Z'],
  ['62143.00', '0.00800', 'buy', '2026-10-25T14:30:12.509Z'],
  ['62146.80', '0.10500', 'buy', '2026-10-25T14:29:58.041Z'],
  ['62139.20', '0.04000', 'sell', '2026-10-25T14:29:20.377Z'],
  ['62142.00', '0.00610', 'buy', '2026-10-25T14:28:47.926Z'],
  ['62137.50', '0.12000', 'sell', '2026-10-25T14:28:03.655Z'],
]));
write('trades.ETH-USDT.json', tape('ETH-USDT', [
  ['3012.40', '0.2500', 'buy', '2026-10-25T14:31:40.512Z'],
  ['3012.20', '0.0800', 'sell', '2026-10-25T14:31:02.193Z'],
  ['3013.10', '1.1000', 'buy', '2026-10-25T14:30:37.840Z'],
  ['3011.80', '0.4200', 'sell', '2026-10-25T14:29:55.008Z'],
  ['3011.80', '0.0500', 'sell', '2026-10-25T14:29:21.617Z'],
  ['3013.60', '0.6400', 'buy', '2026-10-25T14:28:44.276Z'],
  ['3012.90', '0.1500', 'buy', '2026-10-25T14:28:09.931Z'],
  ['3010.70', '0.9000', 'sell', '2026-10-25T14:27:30.452Z'],
  ['3011.50', '0.3300', 'buy', '2026-10-25T14:26:58.120Z'],
  ['3010.20', '0.2000', 'sell', '2026-10-25T14:26:11.764Z'],
]));
write('trades.SOL-USDT.json', tape('SOL-USDT', [
  ['142.18', '12.400', 'buy', '2026-10-25T14:31:51.306Z'],
  ['142.17', '4.000', 'sell', '2026-10-25T14:31:20.889Z'],
  ['142.20', '31.500', 'buy', '2026-10-25T14:30:49.512Z'],
  ['142.15', '8.250', 'sell', '2026-10-25T14:30:15.044Z'],
  ['142.16', '2.600', 'buy', '2026-10-25T14:29:38.701Z'],
  ['142.12', '18.000', 'sell', '2026-10-25T14:29:02.385Z'],
  ['142.14', '6.400', 'buy', '2026-10-25T14:28:26.910Z'],
  ['142.10', '44.000', 'sell', '2026-10-25T14:27:49.573Z'],
  ['142.13', '3.300', 'buy', '2026-10-25T14:27:13.246Z'],
  ['142.11', '15.600', 'sell', '2026-10-25T14:26:40.808Z'],
]));
write('trades.BNB-USDT.json', tape('BNB-USDT', [
  ['588.90', '1.250', 'sell', '2026-10-25T13:04:52.418Z'],
  ['589.10', '0.400', 'buy', '2026-10-25T13:04:11.062Z'],
  ['588.95', '2.100', 'sell', '2026-10-25T13:03:37.795Z'],
  ['589.30', '0.650', 'buy', '2026-10-25T13:02:58.331Z'],
  ['589.05', '1.800', 'sell', '2026-10-25T13:02:20.904Z'],
  ['589.40', '0.300', 'buy', '2026-10-25T13:01:44.587Z'],
  ['589.20', '3.000', 'sell', '2026-10-25T13:01:05.126Z'],
  ['589.55', '0.900', 'buy', '2026-10-25T13:00:29.771Z'],
  ['589.35', '1.150', 'sell', '2026-10-25T12:59:51.443Z'],
  ['589.60', '0.500', 'buy', '2026-10-25T12:59:12.018Z'],
]));

// ---------------------------------------------------------------- people
const DEMO = '66f19a3c5e7b2d4f8a1c0e01';
const ADMIN = '66e8d47b2c9f5a1e3d6b0a12';
const people = [];
const person = (p) => {
  const user = {
    id: p.id ?? oid('66e'),
    email: p.email,
    displayName: p.name,
    role: p.role ?? 'user',
    status: p.status ?? 'active',
    emailVerified: p.emailVerified ?? true,
    kycStatus: p.kyc ?? 'none',
    twoFactorEnabled: p.twoFactorAt != null,
    twoFactorEnabledAt: p.twoFactorAt ?? null,
    hasPassword: true,
    googleLinked: p.googleLinked ?? false,
    avatarUrl: null,
    preferences: { theme: 'light', hideSmallBalances: false },
    createdAt: iso(p.joined),
    isBot: p.isBot ?? false,
    failedLoginCount: 0,
    lastLoginAt: p.lastLogin ? iso(p.lastLogin) : null,
  };
  people.push({ user, country: p.country, kycApp: p.kycApp });
  return user;
};

// The ten on the first page of Admin · Users, newest first
person({ id: DEMO, name: 'Demo trader', email: 'demo@orichal.app', joined: '2026-10-24T09:12:31Z', lastLogin: '2026-10-25T14:02:05Z', kyc: 'approved', emailVerified: false, twoFactorAt: '2026-10-24T10:15:08Z', country: 'IN',
  kycApp: { fullName: 'Demo Trader', dateOfBirth: '1998-06-12', documentType: 'passport', last4: '7731', sent: '2026-10-24T10:41:20Z', reviewed: '2026-10-24T11:05:47Z' } });
person({ name: 'Aarav Mehta', email: 'aarav.mehta@example.com', joined: '2026-10-23T18:40:12Z', lastLogin: '2026-10-25T12:40:31Z', kyc: 'pending', country: 'IN',
  kycApp: { fullName: 'Aarav Mehta', dateOfBirth: '2001-04-17', documentType: 'passport', last4: '4821', sent: '2026-10-25T12:18:04Z', selfie: false } });
person({ name: 'Isha Kapoor', email: 'isha.kapoor@example.com', joined: '2026-10-21T10:02:44Z', lastLogin: '2026-10-25T09:15:20Z', kyc: 'approved', country: 'IN',
  kycApp: { fullName: 'Isha Kapoor', dateOfBirth: '1994-11-03', documentType: 'national_id', last4: '6602', sent: '2026-10-21T11:30:00Z', reviewed: '2026-10-21T13:12:00Z' } });
person({ name: 'Daniel Okafor', email: 'd.okafor@example.com', joined: '2026-10-20T15:27:09Z', lastLogin: '2026-10-22T18:03:40Z', kyc: 'rejected', status: 'frozen', country: 'NG',
  kycApp: { fullName: 'Daniel Okafor', dateOfBirth: '1990-02-21', documentType: 'driving_licence', last4: '3317', sent: '2026-10-20T16:05:00Z', reviewed: '2026-10-21T09:40:00Z', reason: 'The photo is too blurry to read the document number.' } });
person({ name: 'Mei Lin', email: 'mei.lin@example.com', joined: '2026-10-19T07:51:30Z', lastLogin: '2026-10-24T21:11:02Z', kyc: 'pending', country: 'TW',
  kycApp: { fullName: 'Mei Lin', dateOfBirth: '1997-08-29', documentType: 'driving_licence', last4: '0954', sent: '2026-10-25T13:40:22Z', selfie: true } });
person({ name: 'Lucía Romero', email: 'lucia.romero@example.com', joined: '2026-10-18T19:20:15Z', lastLogin: '2026-10-25T07:44:48Z', kyc: 'pending', country: 'ES',
  kycApp: { fullName: 'Lucía Romero Vidal', dateOfBirth: '1992-05-14', documentType: 'national_id', last4: '7Q2K', sent: '2026-10-25T12:52:37Z', selfie: true } });
person({ name: 'Kabir Anand', email: 'kabir.anand@example.com', joined: '2026-10-16T11:08:53Z', lastLogin: '2026-10-23T16:20:11Z', kyc: 'approved', country: 'IN',
  kycApp: { fullName: 'Kabir Anand', dateOfBirth: '1988-12-09', documentType: 'passport', last4: '2290', sent: '2026-10-16T12:00:00Z', reviewed: '2026-10-16T15:21:00Z' } });
person({ name: 'Sara Lindqvist', email: 'sara.lindqvist@example.com', joined: '2026-10-15T09:33:27Z', lastLogin: '2026-10-19T10:02:58Z', kyc: 'none', country: 'SE' });
person({ name: 'Arjun Nair', email: 'arjun.nair@example.com', joined: '2026-10-14T14:15:40Z', lastLogin: '2026-10-25T11:30:06Z', kyc: 'approved', country: 'IN',
  kycApp: { fullName: 'Arjun Nair', dateOfBirth: '1996-03-30', documentType: 'national_id', last4: '5148', sent: '2026-10-14T15:00:00Z', reviewed: '2026-10-14T17:45:00Z' } });
person({ id: ADMIN, name: 'Rohan Sethi', email: 'admin@orichal.app', role: 'admin', joined: '2026-10-12T08:00:00Z', lastLogin: '2026-10-25T13:58:42Z', kyc: 'approved', country: 'IN',
  kycApp: { fullName: 'Rohan Sethi', dateOfBirth: '1991-07-22', documentType: 'passport', last4: '9036', sent: '2026-10-12T08:20:00Z', reviewed: '2026-10-12T08:35:00Z' } });

// Four more applicants in the KYC queue, then everyone else, newest first
const COUNTRY = { IN: 'India', BR: 'Brazil', DE: 'Germany', GH: 'Ghana', JP: 'Japan', GB: 'United Kingdom', MA: 'Morocco', MX: 'Mexico', CZ: 'Czechia', FR: 'France', NG: 'Nigeria', IT: 'Italy', US: 'United States', ES: 'Spain', BG: 'Bulgaria', AE: 'United Arab Emirates', PT: 'Portugal', SE: 'Sweden', JO: 'Jordan', NO: 'Norway', PK: 'Pakistan', KR: 'South Korea', EG: 'Egypt', AT: 'Austria', DK: 'Denmark', AR: 'Argentina', TW: 'Taiwan' };
const rest = [
  ['Tomás Silva', 'tomas.silva', 'BR', 'pending', 'passport', '2026-10-25T13:55:41Z'],
  ['Priya Raman', 'priya.raman', 'IN', 'pending', 'national_id', '2026-10-25T14:06:19Z'],
  ['Jonas Weber', 'jonas.weber', 'DE', 'pending', 'passport', '2026-10-25T14:19:03Z'],
  ['Ama Mensah', 'ama.mensah', 'GH', 'pending', 'national_id', '2026-10-25T14:27:56Z'],
  ['Nikhil Rao', 'nikhil.rao', 'IN', 'approved'], ['Hana Sato', 'hana.sato', 'JP', 'approved'],
  ['Oliver Grant', 'oliver.grant', 'GB', 'approved'], ['Fatima Zahra', 'fatima.zahra', 'MA', 'none'],
  ['Diego Morales', 'diego.morales', 'MX', 'approved'], ['Ananya Iyer', 'ananya.iyer', 'IN', 'approved'],
  ['Lukas Novak', 'lukas.novak', 'CZ', 'none'], ['Chloé Martin', 'chloe.martin', 'FR', 'approved'],
  ['Ibrahim Yusuf', 'ibrahim.yusuf', 'NG', 'rejected'], ['Sofia Rossi', 'sofia.rossi', 'IT', 'approved'],
  ['Ethan Brooks', 'ethan.brooks', 'US', 'none'], ['Aditi Sharma', 'aditi.sharma', 'IN', 'approved'],
  ['Mateo García', 'mateo.garcia', 'ES', 'approved'], ['Yuki Tanaka', 'yuki.tanaka', 'JP', 'none'],
  ['Grace Owusu', 'grace.owusu', 'GH', 'approved'], ['Vikram Shah', 'vikram.shah', 'IN', 'approved'],
  ['Elena Petrova', 'elena.petrova', 'BG', 'none'], ['Noah Fischer', 'noah.fischer', 'DE', 'approved'],
  ['Zara Ahmed', 'zara.ahmed', 'AE', 'approved'], ['Leo Dubois', 'leo.dubois', 'FR', 'none'],
  ['Meera Pillai', 'meera.pillai', 'IN', 'approved'], ['Samuel Adeyemi', 'samuel.adeyemi', 'NG', 'approved'],
  ['Inês Costa', 'ines.costa', 'PT', 'rejected'], ['Rahul Verma', 'rahul.verma', 'IN', 'approved'],
  ['Freya Nilsson', 'freya.nilsson', 'SE', 'none'], ['Omar Haddad', 'omar.haddad', 'JO', 'approved'],
  ['Kiara Desai', 'kiara.desai', 'IN', 'approved'], ['Mikael Berg', 'mikael.berg', 'NO', 'none'],
  ['Ayesha Siddiqui', 'ayesha.siddiqui', 'PK', 'approved'], ['Jun Park', 'jun.park', 'KR', 'approved'],
  ['Laila Hassan', 'laila.hassan', 'EG', 'none'], ['Carlos Mendes', 'carlos.mendes', 'BR', 'approved'],
  ['Tara Menon', 'tara.menon', 'IN', 'approved'], ['Felix Wagner', 'felix.wagner', 'AT', 'none'],
  ['Nadia Khan', 'nadia.khan', 'GB', 'approved'], ['Ryo Nakamura', 'ryo.nakamura', 'JP', 'approved'],
  ['Amara Okeke', 'amara.okeke', 'NG', 'none'], ['Lars Jensen', 'lars.jensen', 'DK', 'approved'],
  ['Isabel Ruiz', 'isabel.ruiz', 'AR', 'approved'], ['Kenji Ito', 'kenji.ito', 'JP', 'none'],
];
const REJECT_REASONS = {
  'Ibrahim Yusuf': 'The date of birth on the form doesn\'t match the document.',
  'Inês Costa': 'Part of the document is cut off. Send a photo that shows all four corners.',
};
let joined = new Date('2026-10-11T16:20:00Z').getTime();
for (const [name, local, country, kyc, docType, sent] of rest) {
  const createdAt = new Date(joined).toISOString();
  const lastLogin = new Date(Math.min(joined + (1 + rand() * 12) * 86400000, new Date('2026-10-25T14:20:00Z').getTime() - rand() * 6 * 86400000)).toISOString();
  const app = kyc === 'none' ? undefined : {
    fullName: name,
    dateOfBirth: `${1975 + Math.floor(rand() * 28)}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
    documentType: docType ?? pick(['passport', 'national_id', 'driving_licence']),
    last4: hex(4).toUpperCase().replace(/[A-F]/g, (c) => String('ABCDEF'.indexOf(c) + 2)),
    sent: sent ?? addMs(createdAt, (1 + rand() * 20) * 3600000),
    selfie: rand() > 0.5,
  };
  if (app && kyc !== 'pending') {
    app.reviewed = addMs(app.sent, (0.5 + rand() * 6) * 3600000);
    if (kyc === 'rejected') app.reason = REJECT_REASONS[name];
  }
  person({ name, email: `${local}@example.com`, joined: createdAt, lastLogin: lastLogin < createdAt ? addMs(createdAt, 3600000) : lastLogin, kyc, country, kycApp: app });
  joined -= (0.7 + rand() * 1.6) * 86400000;
}
// The two bot accounts: hidden from user numbers and from the admin list
person({ id: '66e1b0a7c3f9d2e5481b7c01', name: 'bot-maker', email: 'bot-maker@orichal.internal', joined: '2026-08-20T06:00:00Z', lastLogin: null, isBot: true, kyc: 'none' });
person({ id: '66e1b0a7c3f9d2e5481b7c02', name: 'bot-taker', email: 'bot-taker@orichal.internal', joined: '2026-08-20T06:00:00Z', lastLogin: null, isBot: true, kyc: 'none' });

const users = people.map((p) => p.user);
const byName = (name) => users.find((u) => u.displayName === name);
write('users.json', { items: users, page: 1, total: users.filter((u) => !u.isBot).length });

// ---------------------------------------------------------------- KYC applications
const kycItems = [];
for (const { user, country, kycApp: a } of people) {
  if (!a) continue;
  kycItems.push({
    id: oid('66f2'),
    status: user.kycStatus,
    fullName: a.fullName,
    dateOfBirth: a.dateOfBirth,
    country,
    documentType: a.documentType,
    documentNumberLast4: a.last4,
    rejectReason: a.reason ?? null,
    createdAt: iso(a.sent),
    reviewedAt: a.reviewed ? iso(a.reviewed) : null,
    reviewedBy: a.reviewed ? ADMIN : null,
    hasSelfie: Boolean(a.selfie),
    userId: user.id,
    userEmail: user.email,
    userDisplayName: user.displayName,
    userCreatedAt: user.createdAt,
  });
}
write('kyc.json', { items: kycItems });

// ---------------------------------------------------------------- the ledger engine for the seed
const wallets = new Map(); // userId|asset -> { available, locked }
const ledger = [];
const wallet = (userId, asset) => {
  const key = `${userId}|${asset}`;
  if (!wallets.has(key)) wallets.set(key, { userId, asset, available: '0', locked: '0' });
  return wallets.get(key);
};
const entry = (userId, asset, type, dA, dL, refType, refId, time, note) => {
  const w = wallet(userId, asset);
  w.available = m.add(w.available, dA);
  w.locked = m.add(w.locked, dL);
  if (m.isNegative(w.available) || m.isNegative(w.locked)) throw new Error(`negative balance ${userId} ${asset} ${type}`);
  ledger.push({
    id: oid('66f4'),
    userId, asset, type,
    deltaAvailable: fx(dA, asset), deltaLocked: fx(dL, asset),
    availableAfter: fx(w.available, asset), lockedAfter: fx(w.locked, asset),
    refType, refId: refId ?? null,
    note: note ?? null,
    time: iso(time),
  });
};

const orders = [];
const fills = [];
const transactions = [];
const notifications = [];

const order = (o) => {
  const record = {
    id: o.id ?? oid('66f3'),
    market: o.market, side: o.side, type: o.type, timeInForce: o.type === 'limit' ? 'GTC' : 'IOC',
    price: o.price ?? null,
    quantity: o.quantity ?? null,
    quoteQuantity: o.quoteQuantity ?? null,
    filledQuantity: '0', executedQuote: '0', avgPrice: null,
    fee: '0', feeAsset: o.side === 'buy' ? MARKETS[o.market].base : 'USDT',
    status: 'pending', cancelReason: null, rejectReason: null,
    clientOrderId: o.clientOrderId ?? uuid(),
    createdAt: iso(o.at), updatedAt: iso(o.at), appliedAt: null,
    userId: o.userId,
  };
  const base = MARKETS[o.market].base;
  const lock = o.side === 'buy' ? (o.type === 'market' ? o.quoteQuantity : m.mul(o.price, o.quantity)) : o.quantity;
  entry(o.userId, o.side === 'buy' ? 'USDT' : base, 'order_lock', m.neg(lock), lock, 'order', record.id, o.at);
  orders.push(record);
  return record;
};
const apply = (record, at) => {
  record.status = 'open';
  record.appliedAt = iso(at);
  record.updatedAt = iso(at);
};
// A fill on `record` (the demo side), with role maker or taker
const fill = (record, { id, p, q, role, at }) => {
  const base = MARKETS[record.market].base;
  const quote = m.mul(p, q);
  const rate = role === 'maker' ? '0.0008' : '0.001';
  const feeAsset = record.side === 'buy' ? base : 'USDT';
  const fee = m.round(m.mul(record.side === 'buy' ? q : quote, rate, 'up'), ASSETS[feeAsset].decimals, 'ceil');
  const tradeId = id ?? oid('66f3');
  if (record.side === 'buy') {
    entry(record.userId, 'USDT', 'trade_debit', '0', m.neg(quote), 'trade', tradeId, at);
    entry(record.userId, base, 'trade_credit', q, '0', 'trade', tradeId, at);
    entry(record.userId, base, 'trade_fee', m.neg(fee), '0', 'trade', tradeId, at);
  } else {
    entry(record.userId, base, 'trade_debit', '0', m.neg(q), 'trade', tradeId, at);
    entry(record.userId, 'USDT', 'trade_credit', quote, '0', 'trade', tradeId, at);
    entry(record.userId, 'USDT', 'trade_fee', m.neg(fee), '0', 'trade', tradeId, at);
  }
  record.filledQuantity = m.add(record.filledQuantity, q);
  record.executedQuote = m.add(record.executedQuote, quote);
  record.fee = m.add(record.fee, fee);
  const target = record.quantity ?? record.filledQuantity;
  record.status = m.gte(record.filledQuantity, target) ? 'filled' : 'partially_filled';
  record.updatedAt = iso(at);
  fills.push({
    id: tradeId, orderId: record.id, market: record.market, side: record.side, role,
    price: price(p), quantity: qty(q, record.market), quoteQuantity: fx(quote, 'USDT'),
    fee: fx(fee, feeAsset), feeAsset, time: iso(at), userId: record.userId,
  });
};
const finish = (record) => {
  const step = MARKETS[record.market].step;
  record.price = record.price && price(record.price);
  record.quantity = record.quantity && qty(record.quantity, record.market);
  record.quoteQuantity = record.quoteQuantity && fx(record.quoteQuantity, 'USDT');
  record.filledQuantity = qty(record.filledQuantity, record.market);
  record.executedQuote = fx(record.executedQuote, 'USDT');
  record.fee = fx(record.fee, record.feeAsset);
  record.avgPrice = m.isZero(record.filledQuantity) ? null : m.fixed(m.div(record.executedQuote, record.filledQuantity, 8), 2);
  if (record.type === 'market' && record.quantity == null) record.quantity = null;
  void step;
};
const notify = (userId, type, title, body, link, at, read) => notifications.push({
  id: oid('66f5'), type, title, body, link, read, createdAt: iso(at), userId,
});

// ---------------------------------------------------------------- the demo trader, from the boards
entry(DEMO, 'USDT', 'demo_credit', '10000', '0', 'system', null, '2026-10-24T09:12:31.240Z', 'Sign-up credit');
notify(DEMO, 'deposit', 'Welcome to Orichal', 'Your 10,000 demo USDT is in your wallet.', '/wallet', '2026-10-24T09:12:31.300Z', true);
notify(DEMO, 'security', 'Two-factor turned on', 'Logging in and withdrawing now ask for a code from your authenticator app.', '/account/security', '2026-10-24T10:15:08Z', true);
notify(DEMO, 'kyc', 'Identity verified', 'An admin approved your identity check. Withdrawals are open.', '/account/verification', '2026-10-24T11:05:47Z', true);

const btcBuy = order({ id: '66f1a9e3c7d2b4f8a06e2a3c', userId: DEMO, market: 'BTC-USDT', side: 'buy', type: 'limit', price: '60160.00', quantity: '0.0625', at: '2026-10-24T11:20:44.310Z' });
btcBuy.appliedAt = iso('2026-10-24T11:20:44.402Z');
fill(btcBuy, { id: '66f1a9e3d0b5c7e2f4182a51', p: '60160.00', q: '0.0625', role: 'taker', at: '2026-10-24T11:20:44.402Z' });
notify(DEMO, 'order_filled', 'Order filled', 'Buy 0.06250 BTC at 60,160.00', '/orders?tab=history', '2026-10-24T11:20:44.402Z', true);

const deposit = {
  id: '66f1b0d6a4e2c9f71b3d5e08', type: 'deposit', method: 'simulated', asset: 'USDT', amount: fx('2000', 'USDT'), fee: fx('0', 'USDT'),
  receiveAmount: null, fiatAmount: null, fiatCurrency: null,
  address: 'sim-usdt-3d81c0f9a2b6e417', txHash: '0x9c1e5b8d3f2a7c04e6d91b3a5f8e2c7d0b4e41ab',
  status: 'completed', rejectReason: null, createdAt: iso('2026-10-24T12:05:13.120Z'), reviewedAt: null,
  userId: DEMO, userEmail: 'demo@orichal.app', userDisplayName: 'Demo trader',
};
transactions.push(deposit);
entry(DEMO, 'USDT', 'deposit', '2000', '0', 'transaction', deposit.id, '2026-10-24T12:05:13.120Z');
notify(DEMO, 'deposit', 'Deposit completed', '2,000.00 USDT is in your wallet.', '/wallet/history', '2026-10-24T12:05:13.200Z', false);

const ethBuy = order({ id: '66f1b2c8e4a7d3f05b914b70', userId: DEMO, market: 'ETH-USDT', side: 'buy', type: 'limit', price: '3000.00', quantity: '0.4', at: '2026-10-24T12:07:10.118Z' });
ethBuy.appliedAt = iso('2026-10-24T12:07:10.205Z');
fill(ethBuy, { id: '66f1b2c9a1d6e3f7c0584b7c', p: '3000.00', q: '0.4', role: 'taker', at: '2026-10-24T12:07:10.205Z' });
notify(DEMO, 'order_filled', 'Order filled', 'Buy 0.4000 ETH at 3,000.00', '/orders?tab=history', '2026-10-24T12:07:10.205Z', false);

const solBuy = order({ id: '66f1c4e7b2a9d5f3e1086d09', userId: DEMO, market: 'SOL-USDT', side: 'buy', type: 'market', quoteQuantity: '840', at: '2026-10-24T16:44:02.051Z' });
solBuy.appliedAt = iso('2026-10-24T16:44:02.136Z');
fill(solBuy, { id: '66f1c4e8d3b0a6f2c9746d12', p: '140.00', q: '6', role: 'taker', at: '2026-10-24T16:44:02.136Z' });
solBuy.status = 'filled';
notify(DEMO, 'order_filled', 'Order filled', 'Buy 6.000 SOL at 140.00', '/orders?tab=history', '2026-10-24T16:44:02.136Z', false);

const ethLimit = order({ id: '66f3c1a9d0e35b8c4f72a3b8', userId: DEMO, market: 'ETH-USDT', side: 'buy', type: 'limit', price: '2980.00', quantity: '0.5', at: '2026-10-25T13:58:09.300Z' });
apply(ethLimit, '2026-10-25T13:58:09.377Z');
const btcSell = order({ id: '66f3c1b4e8d27a3f0b6ca512', userId: DEMO, market: 'BTC-USDT', side: 'sell', type: 'limit', price: '62400.00', quantity: '0.025', clientOrderId: 'b5c0d2f4-7e31-4a9e-9c55-2f0de1e3e19a', at: '2026-10-25T14:05:42.081Z' });
apply(btcSell, '2026-10-25T14:05:42.164Z');
const btcBid = order({ id: '66f3c1d8a2e94b07c5d1a7e0', userId: DEMO, market: 'BTC-USDT', side: 'buy', type: 'limit', price: '61950.00', quantity: '0.05', at: '2026-10-25T14:20:11.640Z' });
apply(btcBid, '2026-10-25T14:20:11.712Z');
fill(btcSell, { id: '66f3c1c7f1a8e2d4b093a64e', p: '62400.00', q: '0.01', role: 'maker', at: '2026-10-25T14:21:07.512Z' });
order({ id: '66f3c1e2b7a04d1f9e2ba91c', userId: DEMO, market: 'BTC-USDT', side: 'buy', type: 'limit', price: '62000.00', quantity: '0.01', at: '2026-10-25T14:32:10.004Z' });

// ---------------------------------------------------------------- everyone else
// Their events run in time order, so each wallet's ledger chain is chronological.
const events = [];
const later = (at, run) => events.push({ at: iso(at), run });
const others = users.filter((u) => !u.isBot && u.id !== DEMO);
for (const u of others) later(addMs(u.createdAt, 240), () => entry(u.id, 'USDT', 'demo_credit', '10000', '0', 'system', null, addMs(u.createdAt, 240), 'Sign-up credit'));

const tx = (u, t) => {
  const record = {
    id: oid('66f6'), type: t.type, method: 'simulated', asset: t.asset,
    amount: fx(t.amount, t.asset), fee: fx(t.fee ?? '0', t.asset),
    receiveAmount: t.type === 'withdrawal' ? fx(m.sub(t.amount, t.fee), t.asset) : null,
    fiatAmount: null, fiatCurrency: null, address: t.address,
    txHash: t.status === 'completed' ? `0x${hex(40)}` : null,
    status: t.status, rejectReason: t.reason ?? null,
    createdAt: iso(t.at), reviewedAt: t.reviewed ? iso(t.reviewed) : null,
    userId: u.id, userEmail: u.email, userDisplayName: u.displayName,
  };
  transactions.push(record);
  if (t.type === 'deposit') entry(u.id, t.asset, 'deposit', t.amount, '0', 'transaction', record.id, t.at);
  else {
    entry(u.id, t.asset, 'withdrawal_lock', m.neg(t.amount), t.amount, 'transaction', record.id, t.at);
    if (t.status === 'completed') {
      entry(u.id, t.asset, 'withdrawal', '0', m.neg(m.sub(t.amount, t.fee)), 'transaction', record.id, t.reviewed);
      entry(u.id, t.asset, 'withdrawal_fee', '0', m.neg(t.fee), 'transaction', record.id, t.reviewed);
    } else if (t.status === 'rejected') {
      entry(u.id, t.asset, 'withdrawal_unlock', t.amount, m.neg(t.amount), 'transaction', record.id, t.reviewed, t.reason);
    }
  }
  return record;
};
const kabir = byName('Kabir Anand');
const arjun = byName('Arjun Nair');
const isha = byName('Isha Kapoor');
const nikhil = byName('Nikhil Rao');
const txLater = (u, t) => later(t.at, () => tx(u, t));
txLater(kabir, { type: 'deposit', asset: 'BTC', amount: '0.08', address: 'sim-btc-4c0e8a2f6d19b357', status: 'completed', at: '2026-10-23T10:12:40Z' });
txLater(kabir, { type: 'withdrawal', asset: 'BTC', amount: '0.01', fee: '0.0002', address: 'sim-btc-e57a0c3d9b2f8146', status: 'completed', at: '2026-10-23T15:40:18Z', reviewed: '2026-10-23T17:02:55Z' });
txLater(arjun, { type: 'deposit', asset: 'ETH', amount: '1', address: 'sim-eth-1d9f3b7e05c2a864', status: 'completed', at: '2026-10-24T09:30:02Z' });
txLater(arjun, { type: 'withdrawal', asset: 'USDT', amount: '300', fee: '1', address: 'sim-usdt-6b2e9d04f7a1c358', status: 'rejected', reason: 'This address is on our blocked list. Use a different one.', at: '2026-10-22T19:14:27Z', reviewed: '2026-10-22T20:41:03Z' });
txLater(nikhil, { type: 'withdrawal', asset: 'USDT', amount: '500', fee: '1', address: 'sim-usdt-a8c3f15e2d07b964', status: 'completed', at: '2026-10-21T08:55:31Z', reviewed: '2026-10-21T10:20:47Z' });
// The three on Admin · Withdrawals, oldest first
txLater(isha, { type: 'withdrawal', asset: 'USDT', amount: '1200', fee: '1', address: 'sim-usdt-2be4f81c9d37a0c1', status: 'pending', at: '2026-10-25T11:30:04Z' });
txLater(kabir, { type: 'withdrawal', asset: 'BTC', amount: '0.05', fee: '0.0002', address: 'sim-btc-91f0a6e2c4b87d22', status: 'pending', at: '2026-10-25T12:52:09Z' });
txLater(arjun, { type: 'withdrawal', asset: 'ETH', amount: '0.75', fee: '0.002', address: 'sim-eth-c3aa58d1f9b20e5f', status: 'pending', at: '2026-10-25T13:41:26Z' });

// 18 resting buy orders from other people, at prices already in the board's books
const restingOthers = [
  ['Arjun Nair', 'BTC-USDT', '62109.40', '0.05'], ['Isha Kapoor', 'BTC-USDT', '62100.00', '0.04'],
  ['Hana Sato', 'BTC-USDT', '62060.00', '0.025'], ['Oliver Grant', 'BTC-USDT', '62030.00', '0.06'],
  ['Diego Morales', 'BTC-USDT', '62000.00', '0.1'], ['Sofia Rossi', 'BTC-USDT', '61985.00', '0.03'],
  ['Aditi Sharma', 'BTC-USDT', '62078.30', '0.02'], ['Grace Owusu', 'BTC-USDT', '62135.00', '0.025'],
  ['Mateo García', 'ETH-USDT', '3008.00', '0.2'], ['Vikram Shah', 'ETH-USDT', '3000.00', '0.5'],
  ['Noah Fischer', 'ETH-USDT', '2995.40', '0.4'], ['Zara Ahmed', 'ETH-USDT', '2990.00', '0.75'],
  ['Meera Pillai', 'ETH-USDT', '2985.60', '1.2'], ['Kabir Anand', 'ETH-USDT', '2980.00', '0.6'],
  ['Samuel Adeyemi', 'SOL-USDT', '142.08', '20'], ['Rahul Verma', 'SOL-USDT', '141.98', '15'],
  ['Omar Haddad', 'SOL-USDT', '141.85', '30'], ['Kiara Desai', 'SOL-USDT', '141.70', '12'],
];
restingOthers.forEach(([name, market, p, q], i) => {
  const u = byName(name);
  const at = new Date(new Date('2026-10-25T09:40:00Z').getTime() + i * 15.3 * 60000 + rand() * 60000).toISOString();
  const appliedAt = addMs(at, 60 + Math.floor(rand() * 60));
  later(at, () => apply(order({ userId: u.id, market, side: 'buy', type: 'limit', price: p, quantity: q, at }), appliedAt));
});

events.sort((a, b) => a.at.localeCompare(b.at)).forEach((e) => e.run());

orders.forEach(finish);
// Files keep records in time order
orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
ledger.sort((a, b) => a.time.localeCompare(b.time));
write('orders.json', { items: orders });
write('fills.json', { items: fills });
write('transactions.json', { items: transactions.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });

const balances = [...wallets.values()].map((w) => ({
  userId: w.userId, asset: w.asset,
  available: fx(w.available, w.asset), locked: fx(w.locked, w.asset), total: fx(m.add(w.available, w.locked), w.asset),
}));
write('balances.json', { items: balances });
write('ledger.json', { items: ledger });

// ---------------------------------------------------------------- watchlists, addresses, sessions, activity
write('watchlists.json', { items: [{ userId: DEMO, watchlist: ['BTC-USDT', 'ETH-USDT'] }] });
write('deposit-addresses.json', { items: [
  { userId: DEMO, asset: 'USDT', address: 'sim-usdt-3d81c0f9a2b6e417' },
  { userId: DEMO, asset: 'BTC', address: 'sim-btc-7f3a91c2e6b04d58' },
  { userId: DEMO, asset: 'ETH', address: 'sim-eth-b04e7a19c3d52f86' },
  { userId: DEMO, asset: 'SOL', address: 'sim-sol-5a2fd8e0c71b9634' },
  { userId: DEMO, asset: 'BNB', address: 'sim-bnb-e93c1b7d40a6f258' },
] });
write('sessions.json', { items: [
  { id: '66f19a3d0c2e4b6a8d1f3e51', device: 'Chrome 130 on macOS', ip: '203.0.113.24', lastUsedAt: iso('2026-10-25T14:02:05Z'), createdAt: iso('2026-10-24T09:12:31.500Z'), current: false, userId: DEMO },
  { id: '66f2e1b7a9c4d0f3e5b28a62', device: 'Safari on iPhone', ip: '198.51.100.7', lastUsedAt: iso('2026-10-24T21:40:03Z'), createdAt: iso('2026-10-24T21:40:03Z'), current: false, userId: DEMO },
  { id: '66f35c0e8b2d7a1f4c9e6b73', device: 'Firefox 131 on Windows', ip: '192.0.2.44', lastUsedAt: iso('2026-10-25T08:02:44Z'), createdAt: iso('2026-10-25T08:02:44Z'), current: false, userId: DEMO },
  { id: '66e8d47c3a0f6b2e9d1c5a84', device: 'Chrome 130 on Windows', ip: '198.51.100.120', lastUsedAt: iso('2026-10-25T13:58:42Z'), createdAt: iso('2026-10-25T13:58:42Z'), current: false, userId: ADMIN },
] });
const demoActor = { id: DEMO, email: 'demo@orichal.app', role: 'user' };
const adminActor = { id: ADMIN, email: 'admin@orichal.app', role: 'admin' };
const audit = [
  [demoActor, 'user.registered', 'user', DEMO, '203.0.113.24', 'Chrome on macOS', '2026-10-24T09:12:31Z'],
  [demoActor, 'user.2fa_enabled', 'user', DEMO, '203.0.113.24', 'Chrome on macOS', '2026-10-24T10:15:08Z'],
  [demoActor, 'kyc.submitted', 'kyc', DEMO, '203.0.113.24', 'Chrome on macOS', '2026-10-24T10:41:20Z'],
  [adminActor, 'admin.kyc_document_viewed', 'kyc', DEMO, '198.51.100.120', 'Chrome on Windows', '2026-10-24T11:04:10Z'],
  [adminActor, 'admin.kyc_approved', 'kyc', DEMO, '198.51.100.120', 'Chrome on Windows', '2026-10-24T11:05:47Z'],
  [demoActor, 'auth.login_failed', 'user', DEMO, '198.51.100.7', 'Safari on iPhone', '2026-10-24T21:39:12Z'],
  [demoActor, 'auth.login', 'user', DEMO, '198.51.100.7', 'Safari on iPhone', '2026-10-24T21:40:03Z'],
  [demoActor, 'auth.login', 'user', DEMO, '192.0.2.44', 'Firefox on Windows', '2026-10-25T08:02:44Z'],
  [adminActor, 'admin.market_halted', 'market', 'BNB-USDT', '198.51.100.120', 'Chrome on Windows', '2026-10-25T13:05:00.120Z'],
  [adminActor, 'auth.login', 'user', ADMIN, '198.51.100.120', 'Chrome on Windows', '2026-10-25T13:58:42Z'],
  [demoActor, 'auth.login', 'user', DEMO, '203.0.113.24', 'Chrome on macOS', '2026-10-25T14:02:05Z'],
].map(([actor, action, targetType, targetId, ip, device, at]) => ({
  id: oid('66f7'), actor, action, targetType, targetId,
  metadata: action === 'admin.market_halted' ? { cancelOpenOrders: true } : {},
  ip, device, createdAt: iso(at),
}));
write('audit-logs.json', { items: audit });
write('notifications.json', { items: notifications });

// ---------------------------------------------------------------- admin stats and system health
const series = [
  ['2026-10-11', '14210000'], ['2026-10-12', '15120000'], ['2026-10-13', '13830000'], ['2026-10-14', '16420000'],
  ['2026-10-15', '17890000'], ['2026-10-16', '15190000'], ['2026-10-17', '12590000'], ['2026-10-18', '13310000'],
  ['2026-10-19', '16780000'], ['2026-10-20', '18100000'], ['2026-10-21', '17240000'], ['2026-10-22', '16010000'],
  ['2026-10-23', '15680000'], ['2026-10-24', '16893111.52'],
];
write('admin-stats.json', {
  volumePrev24h: '16893111.52',
  fees24h: '31284.60',
  volumeSeries: series.map(([day, quoteVolume]) => ({ day, quoteVolume: m.fixed(quoteVolume, 2) })),
});
write('system-health.json', {
  checkedAt: iso('2026-10-25T14:32:12Z'),
  mongo: { status: 'healthy', replicaSet: 'rs0', primary: 1, secondaries: 2, pingMs: 3 },
  redis: { status: 'healthy', aof: true, usedMemory: 42991616, maxMemory: 268435456 },
  engine: {
    leaderId: 'engine-7f2c', heartbeatAt: iso('2026-10-25T14:32:10Z'), marketsLoaded: 4, streamLag: 1, oldestWaitMs: 200,
    markets: [
      { symbol: 'BTC-USDT', waiting: 0, lastCommand: { type: 'place', at: iso('2026-10-25T14:32:10.091Z') }, maker: 'quoting' },
      { symbol: 'ETH-USDT', waiting: 0, lastCommand: { type: 'cancel', at: iso('2026-10-25T14:31:58.402Z') }, maker: 'quoting' },
      { symbol: 'SOL-USDT', waiting: 1, lastCommand: { type: 'place', at: iso('2026-10-25T14:32:09.877Z') }, maker: 'quoting' },
      { symbol: 'BNB-USDT', waiting: 0, lastCommand: { type: 'config', detail: 'halt', at: iso('2026-10-25T13:05:00.120Z') }, maker: 'cancelled' },
    ],
  },
  apiInstances: [{ id: 'api-1', ready: true, sockets: 21 }, { id: 'api-2', ready: true, sockets: 17 }],
  sockets: 38,
});

// ---------------------------------------------------------------- mock sign-in (not a DTO)
write('demo-accounts.json', {
  note: 'Mock sign-in for the static phase. The real server checks bcrypt hashes and TOTP codes; this file goes away with the mock.',
  accounts: [
    { email: 'demo@orichal.app', password: 'orichal-demo', twoFactorCode: '123456' },
    { email: 'admin@orichal.app', password: 'orichal-demo', twoFactorCode: null },
  ],
});
