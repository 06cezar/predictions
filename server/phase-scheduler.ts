import { db } from './db';
import { settings } from './schema';
import { eq } from 'drizzle-orm';
import { notifyAllUsersPhaseChange } from './notifications-helper';

export function startPhaseScheduler() {
  setInterval(() => {
    const s = db.select().from(settings).where(eq(settings.id, 1)).get();
    if (!s || !s.autoAdvancePhase) return;

    const now = new Date();

    if (s.currentPhase === 'submission' && s.submissionDeadline) {
      if (now >= new Date(s.submissionDeadline)) {
        console.log('[Scheduler] Advancing from submission → reveal');
        db.update(settings).set({ currentPhase: 'reveal' }).where(eq(settings.id, 1)).run();
        notifyAllUsersPhaseChange('reveal');
      }
    } else if (s.currentPhase === 'reveal' && s.revealDeadline) {
      if (now >= new Date(s.revealDeadline)) {
        console.log('[Scheduler] Advancing from reveal → done');
        db.update(settings).set({ currentPhase: 'done' }).where(eq(settings.id, 1)).run();
        notifyAllUsersPhaseChange('done');
      }
    }
  }, 60_000); // Check every minute
}
