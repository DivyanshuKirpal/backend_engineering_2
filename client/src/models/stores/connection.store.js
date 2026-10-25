// Socket and engine status (section 1, connection.store) for the header's
// ConnectionStatus: connected with a recent engine heartbeat reads "live";
// a dropped socket reads "reconnecting".

import { createStore } from './createStore.js';
import { socket } from '../realtime/socket.js';

export const connection = createStore({ socket: socket.status, engineHeartbeatAt: null });

socket.on('status', (status) => connection.set({ socket: status }));
socket.on('engine.status', ({ heartbeatAt }) => connection.set({ engineHeartbeatAt: heartbeatAt }));
