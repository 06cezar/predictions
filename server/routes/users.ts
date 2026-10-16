import { Router } from 'express';
import { db } from '../db';
import { users, predictions } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, getCurrentUser } from '../auth';
import { getAvgRating } from '../services/ratings';

const router = Router();

router.get('/me', requireAuth, (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const allUsers = db.select({ id: users.id }).from(users).all();
  const totalTargets = allUsers.filter(u => u.id !== user.id).length;

  const myPredictions = db.select().from(predictions).where(eq(predictions.authorId, user.id)).all();
  const predictionsAboutMe = db.select().from(predictions).where(eq(predictions.targetId, user.id)).all();

  res.json({
    id: user.id,
    name: user.name,
    isAdmin: user.isAdmin,
    stats: {
      predictionsWritten: myPredictions.length,
      totalTargets,
      predictionsReceived: predictionsAboutMe.length,
    }
  });
});

router.get('/', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;
  const allUsers = db.select({ id: users.id, name: users.name }).from(users).all();

  // For each user, check if current user has written a prediction for them
  // and get the avg rating of that prediction
  const result = allUsers
    .filter(u => u.id !== me.id)
    .map(u => {
      const pred = db.select().from(predictions)
        .where(and(eq(predictions.authorId, me.id), eq(predictions.targetId, u.id)))
        .get();

      return {
        id: u.id,
        name: u.name,
        hasPrediction: !!pred,
        avgRating: pred ? getAvgRating(pred.id) : null,
      };
    });

  res.json(result);
});

export default router;
