import { eq } from 'drizzle-orm';
import { db } from '../db';
import { settings } from '../schema';

export const PHASES = ['submission', 'reveal', 'done'] as const;
export type Phase = typeof PHASES[number];
export type Settings = typeof settings.$inferSelect;

/** The game has a single settings row (id = 1), created by applySchema(). */
export function getSettings(): Settings {
  return db.select().from(settings).where(eq(settings.id, 1)).get()!;
}

export function updateSettings(values: Partial<typeof settings.$inferInsert>) {
  db.update(settings).set(values).where(eq(settings.id, 1)).run();
}

/** Can players still write and edit predictions? Admin override keeps it open. */
export function isSubmissionOpen(s: Settings) {
  if (s.adminOverride) return true;
  if (s.currentPhase !== 'submission') return false;
  if (s.submissionDeadline) {
    return new Date() < new Date(s.submissionDeadline);
  }
  return true;
}
