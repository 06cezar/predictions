import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin, getCurrentUser } from '../auth';
import { getSettings, Settings } from '../services/settings';
import { GameSnapshot, Prediction, loadSnapshot } from '../services/snapshot';
import { calcScores, scoringTiers } from '../services/scoring';
import * as awards from '../services/awards';

const router = Router();

function leaderboard() {
  const s = getSettings();
  const tiers = scoringTiers(s.ratingThreshold);
  return calcScores(loadSnapshot(), s.ratingThreshold).map(u => ({ ...u, ...tiers }));
}

router.get('/', requireAuth, (req, res) => {
  if (getSettings().currentPhase !== 'done') {
    return res.status(403).json({ error: 'Leaderboard is only available after the game is done' });
  }
  res.json(leaderboard());
});

router.get('/preview', requireAdmin, (req, res) => {
  res.json(leaderboard());
});

// ---- Hall of Fame ----

/** Awards are revealed when the game is done; admins can preview them earlier. */
function requireDoneOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (getSettings().currentPhase !== 'done' && !getCurrentUser(req)?.isAdmin) {
    return res.status(403).json({ error: 'Not available yet' });
  }
  next();
}

/** Public view of a prediction; the author stays hidden in anonymous mode. */
function describe(p: Prediction, g: GameSnapshot, s: Settings) {
  return {
    text: p.currentText,
    authorName: s.anonymousPredictions ? null : g.userName(p.authorId),
    targetName: g.userName(p.targetId),
  };
}

function hallOfFame(path: string, render: (g: GameSnapshot, s: Settings) => unknown) {
  router.get(path, requireAuth, requireDoneOrAdmin, (req, res) => {
    res.json(render(loadSnapshot(), getSettings()));
  });
}

hallOfFame('/most-courageous', (g, s) => {
  const award = awards.mostCourageous(g);
  return award && { ...describe(award.prediction, g, s), avg: Math.round(award.avg) };
});

hallOfFame('/most-controversial', (g, s) => {
  const award = awards.mostControversial(g);
  return award && {
    ...describe(award.prediction, g, s),
    avg: Math.round(award.avg),
    stdDev: Math.round(award.stdDev),
    individualRatings: award.scores,
  };
});

hallOfFame('/biggest-miss', (g, s) => {
  const award = awards.biggestMiss(g);
  return award && { ...describe(award.prediction, g, s), avg: Math.round(award.avg) };
});

hallOfFame('/mr-does-it-all', g =>
  awards.starOfTheShow(g).map(w => ({ name: w.name, count: w.count })));

hallOfFame('/best-friends', g =>
  awards.bestFriends(g).map(p => ({ userA: p.userA, userB: p.userB })));

hallOfFame('/most-revised', (g, s) => {
  const award = awards.mostRevised(g);
  return award && {
    ...describe(award.prediction, g, s),
    editCount: award.history.length,
    history: award.history,
  };
});

hallOfFame('/most-unpredictable', g =>
  awards.theJoker(g).map(w => ({ name: w.name, count: w.count })));

hallOfFame('/last-minute', (g, s) => {
  const latest = awards.lastMinute(g);
  return latest && { ...describe(latest, g, s), updatedAt: latest.updatedAt };
});

hallOfFame('/first-to-submit', g => {
  const award = awards.firstToSubmit(g);
  return award && { names: award.names, tied: award.names.length > 1 };
});

export default router;
