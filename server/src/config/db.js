// The MongoDB connection, through Mongoose. connectDb() opens it once, when the
// server (or a script) starts; after that Mongoose keeps a pool of connections
// open, shares it between every query, and reconnects by itself when the
// network comes back. mongoState() is what GET /api/v1/health reports.

import mongoose from 'mongoose';
import { env } from './env.js';

const { connection } = mongoose;

connection.on('connected', () => console.log(`MongoDB connected: database ${connection.name}, ${isLocal() ? 'local' : 'Atlas'}`));
connection.on('disconnected', () => console.log('MongoDB disconnected'));
connection.on('error', (err) => console.error(`MongoDB error: ${err.message}`));

export const isLocal = () => /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(connection.host ?? '');

/** 'up' when the connection is open (Mongoose's readyState 1), otherwise 'down'. */
export const mongoState = () => (connection.readyState === mongoose.ConnectionStates.connected ? 'up' : 'down');

/** Opens the connection; gives up after 5 seconds without finding a server. */
export async function connectDb() {
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
}

export const disconnectDb = () => mongoose.disconnect();

/** A connection failure in words, with what to check. Never prints the connection string. */
export function explainConnection(err) {
  if (err?.code === 8000 || err?.code === 18 || /auth/i.test(err?.message ?? '')) {
    return 'MongoDB refused the sign-in. Check the user name and password in MONGO_URI (server/.env); special characters in the password must be percent-encoded.';
  }
  if (/querySrv|ENOTFOUND|ESERVFAIL/.test(err?.message ?? '')) {
    return 'The host in MONGO_URI (server/.env) wasn\'t found. Check the address, and that this network resolves DNS SRV records.';
  }
  return 'MongoDB can\'t be reached. Check the internet connection, that this laptop\'s IP is under Network Access in Atlas, and that the network doesn\'t block port 27017.';
}
