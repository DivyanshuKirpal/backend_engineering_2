// npm run db:explain: how MongoDB runs the order, trade and ledger queries. For
// each it shows the plan (IXSCAN walks an index, COLLSCAN reads the whole
// collection), and how many index keys and documents it examined for the rows it
// returned. Then the order query once more without the index. Exits 1 if one of
// the three doesn't use its compound index, or examines documents it doesn't return.
//
// The pages are smaller than what matches. When a page holds everything there is,
// all plans cost the same and MongoDB may pick any index.

import { connectDb, disconnectDb, explainConnection } from '../src/config/db.js';
import { ledgerQuery, listQuery, tradesQuery } from '../src/model/services/order.queries.js';
import { LedgerEntry } from '../src/model/schemas/LedgerEntry.js';
import { CLOSED_STATUSES, OPEN_STATUSES, Order } from '../src/model/schemas/Order.js';
import { Trade } from '../src/model/schemas/Trade.js';
import { User } from '../src/model/schemas/User.js';

try {
  await connectDb();
} catch (err) {
  console.error(explainConnection(err));
  process.exit(1);
}

await Promise.all([Order, Trade, LedgerEntry].map((Model) => Model.init())); // the indexes are built before they are asked for

/** Every stage of a plan, outermost first. */
const stages = (plan) => (plan ? [plan, ...[plan.inputStage, ...(plan.inputStages ?? [])].flatMap(stages)] : []);

async function explain(label, query, index) {
  const { queryPlanner, executionStats: stats } = await query.explain('executionStats');
  const found = stages(queryPlanner.winningPlan.queryPlan ?? queryPlanner.winningPlan);
  const indexes = [...new Set(found.map((s) => s.indexName).filter(Boolean))];
  console.log(`\n${label}`);
  console.log(`  plan     ${found.map((s) => s.stage).join(' < ')}`);
  console.log(`  index    ${indexes.join(', ') || 'none'}`);
  console.log(`  keys examined ${stats.totalKeysExamined}, documents examined ${stats.totalDocsExamined}, returned ${stats.nReturned}, ${stats.executionTimeMillis} ms`);
  return indexes.join() === index && !found.some((s) => s.stage === 'COLLSCAN') && stats.totalDocsExamined === stats.nReturned;
}

// The person with the most trades; the half of their orders that has more; a page that leaves two out
const [busiest] = await Trade.aggregate([{ $group: { _id: '$userId', trades: { $sum: 1 } } }, { $sort: { trades: -1, _id: 1 } }, { $limit: 1 }]);
const user = await User.findById(busiest._id).select('email').lean();
const trade = await Trade.findOne({ userId: user._id }).sort({ time: -1, _id: -1 }).lean();
const open = await Order.countDocuments({ userId: user._id, status: { $in: OPEN_STATUSES } });
const closed = await Order.countDocuments({ userId: user._id, status: { $in: CLOSED_STATUSES } });
const state = open >= closed ? 'open' : 'history';
const pageOf = (count) => Math.max(1, Math.min(20, count - 2));
const orders = { state, limit: pageOf(Math.max(open, closed)) };
const trades = { limit: pageOf(busiest.trades) };
console.log(`Query plans for ${user.email}: ${open} open and ${closed} closed orders, ${busiest.trades} trades`);

const results = [
  await explain(`GET /orders?state=${state}&limit=${orders.limit}  Order.find({ userId, status: { $in } }).sort({ createdAt: -1, _id: -1 })`, listQuery(user._id, orders), 'userId_1_status_1_createdAt_-1__id_-1'),
  await explain(`GET /trades?limit=${trades.limit}  Trade.find({ userId }).sort({ time: -1, _id: -1 })`, tradesQuery(user._id, trades), 'userId_1_time_-1__id_-1'),
  await explain('GET /orders/:id, its ledger  LedgerEntry.find({ userId, $or: [the order, its trades] })', ledgerQuery(user._id, trade.orderId, [trade.tradeId]), 'refType_1_refId_1'),
];
await explain('The order query again without its index, hint({ $natural: 1 }): what the index replaces', listQuery(user._id, orders).hint({ $natural: 1 }));
console.log(`
${await Order.estimatedDocumentCount()} orders in the collection. A page asks for one row more than it shows, to know whether there is a next page.`);

const good = results.every(Boolean);
console.log(good
  ? 'All three use their compound index and examine only the documents they return.'
  : `A query doesn't use its compound index, or examines documents it doesn't return. (npm run seed also rebuilds the indexes.)`);
await disconnectDb();
process.exitCode = good ? 0 : 1;
