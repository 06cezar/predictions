import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin } from '../auth';
import { Game } from '../services/games';
import { GameSnapshot, Prediction, loadSnapshot } from '../services/snapshot';
import { calcScores, scoringTiers } from '../services/scoring';
import * as awards from '../services/awards';
import { toIso } from '../time';

const router = Router();

function leaderboard(game: Game) {
  const tiers = scoringTiers(game.ratingThreshold);
  return calcScores(game.id, loadSnapshot(game.id), game.ratingThreshold).map(u => ({ ...u, ...tiers }));
}

router.get('/', requireAuth, (req, res) => {
  if (res.locals.game.currentPhase !== 'done') {
    return res.status(403).json({ error: 'Leaderboard is only available after the game is done' });
  }
  res.json(leaderboard(res.locals.game));
});

router.get('/preview', requireAdmin, (req, res) => {
  res.json(leaderboard(res.locals.game));
});

// ---- Hall of Fame ----

/** Awards are revealed when the game is done; admins can preview them earlier. */
function requireDoneOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (res.locals.game.currentPhase !== 'done' && !res.locals.user.isAdmin) {
    return res.status(403).json({ error: 'Not available yet' });
  }
  next();
}

/** Public view of a prediction; the author stays hidden in anonymous mode. */
function describe(p: Prediction, g: GameSnapshot, game: Game) {
  return {
    text: p.currentText,
    authorName: game.anonymousPredictions ? null : g.userName(p.authorId),
    targetName: g.userName(p.targetId),
  };
}

function hallOfFame(path: string, render: (g: GameSnapshot, game: Game) => unknown) {
  router.get(path, requireAuth, requireDoneOrAdmin, (req, res) => {
    res.json(render(loadSnapshot(res.locals.game.id), res.locals.game));
  });
}

hallOfFame('/most-courageous', (g, game) => {
  const award = awards.mostCourageous(g);
  return award && { ...describe(award.prediction, g, game), avg: Math.round(award.avg) };
});

hallOfFame('/most-controversial', (g, game) => {
  const award = awards.mostControversial(g);
  return (
    award && {
      ...describe(award.prediction, g, game),
      avg: Math.round(award.avg),
      stdDev: Math.round(award.stdDev),
      individualRatings: award.scores,
    }
  );
});

hallOfFame('/biggest-miss', (g, game) => {
  const award = awards.biggestMiss(g);
  return award && { ...describe(award.prediction, g, game), avg: Math.round(award.avg) };
});

hallOfFame('/star-of-the-show', g => awards.starOfTheShow(g).map(w => ({ name: w.name, count: w.count })));

hallOfFame('/best-friends', g => awards.bestFriends(g).map(p => ({ userA: p.userA, userB: p.userB })));

hallOfFame('/most-revised', (g, game) => {
  const award = awards.mostRevised(g);
  return (
    award && {
      ...describe(award.prediction, g, game),
      editCount: award.history.length,
      history: award.history,
    }
  );
});

hallOfFame('/the-joker', g => awards.theJoker(g).map(w => ({ name: w.name, count: w.count })));

hallOfFame('/last-minute', (g, game) => {
  const latest = awards.lastMinute(g);
  return latest && { ...describe(latest, g, game), updatedAt: toIso(latest.updatedAt) };
});

hallOfFame('/first-to-submit', g => {
  const award = awards.firstToSubmit(g);
  return award && { names: award.names, tied: award.names.length > 1 };
});

export default router;
