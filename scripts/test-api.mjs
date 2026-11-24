// npm run test:api: runs the Postman collection in docs/postman with Newman.
// It starts a server of its own on a free port, with a throwaway MongoDB that
// lives in memory and a fresh copy of the demo data, as the checks do. So it
// never touches the database in server/.env, and a dev server may keep running.
// The demo and test routes are off: the collection uses only the real API.
// Afterwards the ledger is checked against the wallets. Exits 1 if anything failed.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import newman from 'newman';
import { startServer } from './checks/harness.mjs';

const folder = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'postman');

const server = await startServer({ DEMO_LATENCY: 'false', DEMO_CONTROLS: 'false', TEST_ROUTES: 'false' });
console.log(`The collection runs on ${server.base}, with its own MongoDB.`);
try {
  const { run } = await new Promise((resolve, reject) => {
    newman.run({
      collection: join(folder, 'crypto-exchange.postman_collection.json'),
      environment: join(folder, 'local.postman_environment.json'),
      envVar: [{ key: 'baseUrl', value: server.base }], // instead of the dev server's
      workingDir: folder, // the sample files of the identity form
      insecureFileRead: false,
      reporters: 'cli',
      reporter: { cli: { noBanner: true } },
    }, (err, summary) => (err ? reject(err) : resolve(summary)));
  });

  const { requests, assertions } = run.stats;
  const elsewhere = run.executions.filter(({ request }) => !request.url.toString().startsWith(`${server.base}/`));
  const ledger = server.runScript('check-ledger.js');
  console.log(`\n${requests.total} requests, ${assertions.total} assertions, ${run.failures.length} failures.`);
  console.log(ledger.stdout.split('\n').find((line) => /wallet/.test(line)) ?? ledger.stdout);
  if (elsewhere.length) console.log(`${elsewhere.length} requests went to another server.`);
  process.exitCode = run.failures.length || elsewhere.length || ledger.status !== 0 ? 1 : 0;
} catch (err) {
  console.error(`Newman couldn't run the collection: ${err.message}`);
  process.exitCode = 1;
} finally {
  await server.stop();
}
