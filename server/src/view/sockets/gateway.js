// The Socket.IO gateway (section 4, WebSocket events), on the same HTTP server
// and port as Express, WebSocket transport only.
//
// A room is a named group of sockets; io.to(room).emit() reaches every socket
// in it. The public rooms are joined by name: the client sends `subscribe` or
// `unsubscribe` with { channel } for `tickers`, `market:{symbol}` or
// `candles:{symbol}:{interval}`, and any other name is refused. The private
// room `user:{id}` is joined only from a valid access token in the handshake
// (auth.token), so nobody can join another user's room by name. Rooms don't
// survive a reconnection; the client joins its rooms again on every connect.
//
// The relay: every event the exchange publishes on the bus goes to the room
// with the channel's name, so a ticker for BTC-USDT reaches `tickers` and
// `market:BTC-USDT`, and an order update reaches its owner's `user:{id}`.

import { Server } from 'socket.io';
import { tap } from '../../model/exchange/bus.js';
import * as session from '../../model/exchange/session.js';

const PUBLIC_ROOM = /^(tickers|market:[A-Z]+-[A-Z]+|candles:[A-Z]+-[A-Z]+:(1m|5m|15m|1h|4h|1d))$/;

const isPublic = (channel) => typeof channel === 'string' && PUBLIC_ROOM.test(channel);

export function attachGateway(httpServer) {
  const io = new Server(httpServer, { transports: ['websocket'], serveClient: false });

  io.on('connection', (socket) => {
    const who = session.fromToken(socket.handshake.auth?.token);
    if (who) socket.join(`user:${who.user.id}`);

    socket.on('subscribe', (payload, ack) => {
      const accepted = isPublic(payload?.channel);
      if (accepted) socket.join(payload.channel);
      if (typeof ack === 'function') ack({ ok: accepted });
    });

    socket.on('unsubscribe', (payload, ack) => {
      if (isPublic(payload?.channel)) socket.leave(payload.channel);
      if (typeof ack === 'function') ack({ ok: true });
    });
  });

  tap((channel, event, payload) => io.to(channel).emit(event, payload));
  return io;
}
