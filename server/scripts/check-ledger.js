// npm run db:check-ledger: proves that every wallet equals the sum of its
// ledger entries. MongoDB adds the entries up per user and asset; this compares
// the sums with the wallets and exits 1 on any difference. Bot accounts keep
// no ledger, so only people's wallets are checked.

import { connectDb, disconnectDb, explainConnection } from '../src/config/db.js';
import { fromDecimal } from '../src/lib/decimal.js';
import * as money from '../../client/src/models/domain/money.js';
import { LedgerEntry } from '../src/model/schemas/LedgerEntry.js';
import { User } from '../src/model/schemas/User.js';
import { Wallet } from '../src/model/schemas/Wallet.js';

try {
  await connectDb();
} catch (err) {
  console.error(explainConnection(err));
  process.exit(1);
}

const people = await User.find({ isBot: false }).select('email').lean();
const ids = people.map((user) => user._id);
const emails = new Map(people.map((user) => [user._id.toString(), user.email]));

// $match keeps people's entries; $group adds them up, one result per user and
// asset. $sum over Decimal128 stays exact.
const sums = await LedgerEntry.aggregate([
  { $match: { userId: { $in: ids } } },
  {
    $group: {
      _id: { userId: '$userId', asset: '$asset' },
      available: { $sum: '$deltaAvailable' },
      locked: { $sum: '$deltaLocked' },
      entries: { $sum: 1 },
    },
  },
]);
const wallets = await Wallet.find({ userId: { $in: ids } }).lean();

const keyOf = (userId, asset) => `${userId}|${asset}`;
const ledger = new Map(sums.map((s) => [keyOf(s._id.userId, s._id.asset), s]));
const held = new Map(wallets.map((w) => [keyOf(w.userId, w.asset), w]));

let differences = 0;
let entries = 0;
for (const key of new Set([...ledger.keys(), ...held.keys()])) {
  const [userId, asset] = key.split('|');
  const sum = ledger.get(key);
  const wallet = held.get(key);
  entries += sum?.entries ?? 0;
  for (const field of ['available', 'locked']) {
    const inWallet = fromDecimal(wallet?.[field]) ?? '0';
    const inLedger = fromDecimal(sum?.[field]) ?? '0';
    if (!money.eq(inWallet, inLedger)) {
      differences += 1;
      console.log(`  ${emails.get(userId)} ${asset} ${field}: wallet ${inWallet}, ledger ${inLedger}`);
    }
  }
}

console.log(differences
  ? `${differences} ${differences === 1 ? 'difference' : 'differences'} between ${wallets.length} wallets and their ledger entries.`
  : `All ${wallets.length} wallets of ${people.length} people equal the sums of their ${entries} ledger entries.`);
await disconnectDb();
process.exitCode = differences ? 1 : 0;
