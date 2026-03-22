import { Router } from 'express';
import { db } from '../db';
import { ratings, predictions, settings } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, getCurrentUser } from '../auth';

const router = Router();

router.post('/', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;
  const { prediction_id, score } = req.body;

  if (prediction_id === undefined || score === undefined) {
    return res.status(400).json({ error: 'prediction_id and score required' });
  }

  const s = parseInt(score);
  if (isNaN(s) || s < 0 || s > 100) {
    return res.status(400).json({ error: 'Score must be 0-100' });
  }

  const gameSettings = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  if (gameSettings.currentPhase !== 'submission') {
    return res.status(403).json({ error: 'Rating is only allowed during the submission phase' });
  }

  const pred = db.select().from(predictions).where(eq(predictions.id, parseInt(prediction_id))).get();
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  if (pred.authorId === me.id) return res.status(403).json({ error: 'Cannot rate your own prediction' });
  if (pred.targetId === me.id) return res.status(403).json({ error: 'Cannot rate a prediction about yourself' });

  // Upsert
  const existing = db.select().from(ratings)
    .where(and(eq(ratings.predictionId, parseInt(prediction_id)), eq(ratings.userId, me.id)))
    .get();

  if (existing) {
    db.update(ratings).set({ score: s })
      .where(and(eq(ratings.predictionId, parseInt(prediction_id)), eq(ratings.userId, me.id)))
      .run();
  } else {
    db.insert(ratings).values({ predictionId: parseInt(prediction_id), userId: me.id, score: s }).run();
  }

  res.json({ success: true });
});

export default router;
