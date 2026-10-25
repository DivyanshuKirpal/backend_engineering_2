// Notification routes (section 4, notification.routes.js, stretch): the
// header's bell reads them.

import { db, persist } from '../db.js';
import { notFound } from '../errors.js';
import { notificationDto } from '../mappers.js';
import * as session from '../session.js';
import { cursorPage, newestFirst } from '../util.js';

export default [
  ['GET', '/notifications', (ctx) => {
    const user = session.requireUser(ctx);
    const mine = db().notifications.filter((n) => n.userId === user.id).sort(newestFirst());
    const list = ctx.query.unread === 'true' ? mine.filter((n) => !n.read) : mine;
    return { data: { ...cursorPage(list, ctx.query, notificationDto), unreadCount: mine.filter((n) => !n.read).length } };
  }],

  ['PATCH', '/notifications/:id/read', (ctx) => {
    const user = session.requireUser(ctx);
    const n = db().notifications.find((x) => x.id === ctx.params.id && x.userId === user.id);
    if (!n) throw notFound('That notification doesn\'t exist.');
    n.read = true;
    persist();
    return { data: { notification: notificationDto(n) } };
  }],

  ['PATCH', '/notifications/read-all', (ctx) => {
    const user = session.requireUser(ctx);
    let updated = 0;
    for (const n of db().notifications) {
      if (n.userId === user.id && !n.read) {
        n.read = true;
        updated += 1;
      }
    }
    persist();
    return { data: { updated } };
  }],
];
