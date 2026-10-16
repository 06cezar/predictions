import { Game, Phase, updateGame } from './games';
import { botsMarkOutcomes } from './demo';
import { notifyAllUsersPhaseChange } from '../notifications-helper';

/** Move a game to another phase. Every phase change (admin or scheduler) goes through here. */
export function changePhase(game: Game, phase: Phase) {
  updateGame(game.id, { currentPhase: phase });
  if (game.isDemo && phase !== 'submission') botsMarkOutcomes(game);
  notifyAllUsersPhaseChange(game.id, phase);
}
