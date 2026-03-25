import { db } from './db';
import { notifications, users } from './schema';
import { eq } from 'drizzle-orm';

export function notifyAllUsersPhaseChange(phase: string) {
  // Remove previous phase_changed notifications before inserting new ones
  db.delete(notifications).where(eq(notifications.type, 'phase_changed')).run();

  const allUsers = db.select({ id: users.id }).from(users).all();
  for (const u of allUsers) {
    db.insert(notifications).values({
      userId: u.id,
      type: 'phase_changed',
      meta: JSON.stringify({ phase }),
    }).run();
  }
}
