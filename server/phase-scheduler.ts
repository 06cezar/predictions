import { db } from './db';
import { games } from './schema';
import { Game, Phase } from './services/games';
import { changePhase } from './services/phases';
import { deleteExpiredDemos } from './services/demo';

/** The phase a game should move to now that a deadline has passed, if any. */
function duePhase(game: Game, now: Date): Phase | null {
  if (!game.autoAdvancePhase) return null;
  if (game.currentPhase === 'submission' && game.submissionDeadline && now >= new Date(game.submissionDeadline)) {
    return 'reveal';
  }
  if (game.currentPhase === 'reveal' && game.revealDeadline && now >= new Date(game.revealDeadline)) {
    return 'done';
  }
  return null;
}

/** Advance every game whose deadline has passed, and delete expired demo games. */
export function runScheduledTasks(now = new Date()) {
  const deleted = deleteExpiredDemos(now);
  if (deleted > 0) console.log(`[Scheduler] Deleted ${deleted} expired demo game(s)`);

  for (const game of db.select().from(games).all()) {
    const next = duePhase(game, now);
    if (!next) continue;
    console.log(`[Scheduler] Game ${game.id}: ${game.currentPhase} → ${next}`);
    changePhase(game, next);
  }
}

export function startPhaseScheduler() {
  setInterval(() => runScheduledTasks(), 60_000); // Check every minute
}
