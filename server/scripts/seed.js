// npm run seed: replaces the demo data, in the MongoDB database MONGO_URI names
// and in the JSON store, with a fresh copy from client/src/models/data.
// Wiping a database that isn't on this machine and holds data needs --yes:
//   npm run seed -- --yes
// Stop the server first: it keeps its own copy of the data in memory.

import mongoose from 'mongoose';
import { connectDb, disconnectDb, explainConnection, isLocal } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { MODELS } from '../src/model/documents.js';
import { seedDatabase } from '../src/model/seed.js';
import * as store from '../src/model/store.js';

try {
  await connectDb();
} catch (err) {
  console.error(explainConnection(err));
  process.exit(1);
}

const { name } = mongoose.connection;
const models = Object.values(MODELS);
const present = await Promise.all(models.map((Model) => Model.countDocuments()));
const total = present.reduce((sum, count) => sum + count, 0);

if (total > 0 && !isLocal() && !process.argv.includes('--yes')) {
  console.error(`Database "${name}" isn't on this machine and holds ${total} documents, which seeding deletes:`);
  models.forEach((Model, i) => console.error(`  ${Model.collection.name.padEnd(14)} ${present[i]}`));
  console.error('To go ahead: npm run seed -- --yes');
  await disconnectDb();
  process.exit(1);
}

try {
  const data = await store.reset();
  const counts = await seedDatabase(data);
  console.log(`Seeded database "${name}" (${isLocal() ? 'local' : 'Atlas'}):`);
  for (const [collection, count] of Object.entries(counts)) console.log(`  ${collection.padEnd(14)} ${count}`);
  console.log(`and the JSON store, ${env.STORE_FILE}`);
} catch (err) {
  console.error(`The seed failed: ${err.message}`);
  process.exitCode = 1;
}
await disconnectDb();
