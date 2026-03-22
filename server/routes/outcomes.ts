import { Router } from 'express';
import { db } from '../db';
import { outcomes, predictions, settings } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, getCurrentUser } from '../auth';

const router = Router();

router.post('/', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  if (s.currentPhase === 'submission') {
    return res.status(403).json({ error: 'Outcomes not available during submission phase' });
  }

  const me = getCurrentUser(req)!;
  const { prediction_id, happened } = req.body;

  if (prediction_id === undefined) return res.status(400).json({ error: 'prediction_id required' });

  const pred = db.select().from(predictions).where(eq(predictions.id, parseInt(prediction_id))).get();
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  if (pred.targetId !== me.id) return res.status(403).json({ error: 'Only the target can mark outcomes' });

  const existing = db.select().from(outcomes).where(eq(outcomes.predictionId, parseInt(prediction_id))).get();

  const happenedVal = happened === null ? null : happened === true || happened === 'true' ? true : false;

  if (existing) {
    db.update(outcomes).set({ happened: happenedVal as boolean | null, markedBy: me.id, markedAt: new Date().toISOString() })
      .where(eq(outcomes.predictionId, parseInt(prediction_id))).run();
  } else {
    db.insert(outcomes).values({
      predictionId: parseInt(prediction_id),
      happened: happenedVal as boolean | null,
      markedBy: me.id,
    }).run();
  }

  res.json({ success: true });
});

export default router;
