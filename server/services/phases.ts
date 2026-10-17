import { Game, Phase, updateGame } from './games';
import { botsFinishSubmission, botsMarkOutcomes, demoPhaseEnds } from './demo';
import { notifyAllUsersPhaseChange } from '../notifications-helper';

/** Move a game to another phase. Every phase change (admin, scheduler, demo skip) goes through here. */
export function changePhase(game: Game, phase: Phase) {
  updateGame(game.id, { currentPhase: phase });
  if (game.isDemo && game.currentPhase === 'submission' && phase !== 'submission') botsFinishSubmission(game);
  if (game.isDemo && phase !== 'submission') botsMarkOutcomes(game);
  notifyAllUsersPhaseChange(game.id, phase);
}

/**
 * Demo only: fast-forward to the next phase as if its deadline had just
 * passed. The bots do their part on the way (see changePhase).
 */
export function skipDemoPhase(game: Game): Phase | null {
  const now = new Date().toISOString();
  if (game.currentPhase === 'submission') {
    updateGame(game.id, { submissionDeadline: now, revealDeadline: demoPhaseEnds() });
    changePhase(game, 'reveal');
    return 'reveal';
  }
  if (game.currentPhase === 'reveal') {
    updateGame(game.id, { revealDeadline: now });
    changePhase(game, 'done');
    return 'done';
  }
  return null;
}
