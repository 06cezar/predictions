import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { notifications, users } from './schema';

export function notifyAllUsersPhaseChange(gameId: number, phase: string) {
  const gameUserIds = db.select({ id: users.id }).from(users).where(eq(users.gameId, gameId));

  // Remove the game's previous phase_changed notifications before inserting new ones
  db.delete(notifications)
    .where(and(eq(notifications.type, 'phase_changed'), inArray(notifications.userId, gameUserIds)))
    .run();

  for (const u of gameUserIds.all()) {
    db.insert(notifications)
      .values({
        userId: u.id,
        type: 'phase_changed',
        meta: JSON.stringify({ phase }),
      })
      .run();
  }
}
