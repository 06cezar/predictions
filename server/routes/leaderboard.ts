import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin } from '../auth';
import { Game } from '../services/games';
import { GameSnapshot, Prediction, loadSnapshot } from '../services/snapshot';
import { calcScores } from '../services/scoring';
import { scoresCsv, sendCsv } from '../services/exports';
import * as awards from '../services/awards';
import { toIso } from '../time';

const router = Router();

/** Scores are out once the game is done (admins preview them through /preview). */
function requireDone(req: Request, res: Response, next: NextFunction) {
  if (res.locals.game.currentPhase !== 'done') {
    return res.status(403).json({ error: 'Leaderboard is only available after the game is done' });
  }
  next();
}

router.get('/', requireAuth, requireDone, (req, res) => {
  const { game } = res.locals;
  res.json(calcScores(game.id, loadSnapshot(game.id), game.ratingThreshold));
});

router.get('/export.csv', requireAuth, requireDone, (req, res) => {
  const { game } = res.locals;
  sendCsv(res, 'leaderboard.csv', scoresCsv(game, loadSnapshot(game.id)));
});

router.get('/preview', requireAdmin, (req, res) => {
  const { game } = res.locals;
  res.json(calcScores(game.id, loadSnapshot(game.id), game.ratingThreshold));
});

/** Public view of a prediction; the author stays hidden in anonymous mode. */
function describe(p: Prediction, g: GameSnapshot, game: Game) {
  return {
    text: p.currentText,
    authorName: game.anonymousPredictions ? null : g.userName(p.authorId),
    targetName: g.userName(p.targetId),
  };
}

/** Every Hall of Fame award; null (or an empty list) where nobody qualifies. */
function hallOfFame(g: GameSnapshot, game: Game) {
  const courageous = awards.mostCourageous(g);
  const miss = awards.biggestMiss(g);
  const controversial = awards.mostControversial(g);
  const revised = awards.mostRevised(g);
  const latest = awards.lastMinute(g);
  const first = awards.firstToSubmit(g);

  return {
    mostCourageous: courageous && { ...describe(courageous.prediction, g, game), avg: Math.round(courageous.avg) },
    biggestMiss: miss && { ...describe(miss.prediction, g, game), avg: Math.round(miss.avg) },
    mostControversial: controversial && {
      ...describe(controversial.prediction, g, game),
      avg: Math.round(controversial.avg),
      stdDev: Math.round(controversial.stdDev),
      individualRatings: controversial.scores,
    },
    mostRevised: revised && {
      ...describe(revised.prediction, g, game),
      editCount: revised.history.length,
      history: revised.history,
    },
    lastMinute: latest && { ...describe(latest, g, game), updatedAt: toIso(latest.updatedAt) },
    firstToSubmit: first && { names: first.names, tied: first.names.length > 1 },
    starOfTheShow: awards.starOfTheShow(g).map(w => ({ name: w.name, count: w.count })),
    theJoker: awards.theJoker(g).map(w => ({ name: w.name, count: w.count })),
    bestFriends: awards.bestFriends(g).map(p => ({ userA: p.userA, userB: p.userB })),
  };
}

// Awards are revealed when the game is done; admins can preview them earlier
router.get('/hall-of-fame', requireAuth, (req, res) => {
  const { user, game } = res.locals;
  if (game.currentPhase !== 'done' && !user.isAdmin) {
    return res.status(403).json({ error: 'Not available yet' });
  }
  res.json(hallOfFame(loadSnapshot(game.id), game));
});

export default router;
