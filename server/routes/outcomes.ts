import { Router } from 'express';
import { db } from '../db';
import { outcomes, predictions, notifications, users } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, getCurrentUser } from '../auth';
import { getSettings } from '../services/settings';

const router = Router();

router.post('/', requireAuth, (req, res) => {
  const s = getSettings();
  if (s.currentPhase === 'submission') {
    return res.status(403).json({ error: 'Outcomes not available during submission phase' });
  }
  if (s.currentPhase === 'done') {
    return res.status(403).json({ error: 'Outcomes are locked - game is over' });
  }
  if (s.revealDeadline && new Date() >= new Date(s.revealDeadline)) {
    return res.status(403).json({ error: 'Reveal phase has ended - outcomes are locked' });
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

  // Delete existing outcome_marked notification for this prediction, then insert new one
  const existingNotifs = db.select({ id: notifications.id, meta: notifications.meta })
    .from(notifications)
    .where(and(eq(notifications.userId, pred.authorId), eq(notifications.type, 'outcome_marked')))
    .all()
    .filter(n => { try { return JSON.parse(n.meta ?? '{}').predictionId === pred.id; } catch { return false; } });
  for (const n of existingNotifs) {
    db.delete(notifications).where(eq(notifications.id, n.id)).run();
  }
  if (happenedVal !== null) {
    const target = db.select({ name: users.name }).from(users).where(eq(users.id, me.id)).get();
    db.insert(notifications).values({
      userId: pred.authorId,
      type: 'outcome_marked',
      authorId: me.id,
      meta: JSON.stringify({ targetName: target?.name ?? 'Someone', happened: happenedVal, predictionId: pred.id }),
    }).run();
  }

  res.json({ success: true });
});

export default router;
