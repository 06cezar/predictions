import { Router } from 'express';
import { db } from '../db';
import { users, predictions } from '../schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { loadSnapshot, roundedAvgRating } from '../services/snapshot';

const router = Router();

router.get('/me', requireAuth, (req, res) => {
  const { user, game } = res.locals;
  const players = db.select({ id: users.id }).from(users).where(eq(users.gameId, game.id)).all();
  const totalTargets = players.filter(u => u.id !== user.id).length;

  const myPredictions = db.select().from(predictions).where(eq(predictions.authorId, user.id)).all();
  const predictionsAboutMe = db.select().from(predictions).where(eq(predictions.targetId, user.id)).all();

  res.json({
    id: user.id,
    name: user.name,
    isAdmin: user.isAdmin,
    game: { id: game.id, name: game.name, isDemo: game.isDemo },
    stats: {
      predictionsWritten: myPredictions.length,
      totalTargets,
      predictionsReceived: predictionsAboutMe.length,
    },
  });
});

// The other players, and whether (and how boldly) I have written about each
router.get('/', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  const g = loadSnapshot(game.id);
  const mine = new Map(g.predictions.filter(p => p.authorId === me.id).map(p => [p.targetId, p]));

  res.json(
    g.users
      .filter(u => u.id !== me.id)
      .map(u => {
        const pred = mine.get(u.id);
        return {
          id: u.id,
          name: u.name,
          hasPrediction: !!pred,
          avgRating: pred ? roundedAvgRating(g, pred.id) : null,
        };
      }),
  );
});

export default router;
