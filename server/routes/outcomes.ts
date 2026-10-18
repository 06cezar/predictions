import { Router } from 'express';
import { db } from '../db';
import { outcomes, predictions, notifications, users } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth';

const router = Router();

router.post('/', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  if (game.currentPhase === 'submission') {
    return res.status(403).json({ error: 'Outcomes not available during submission phase' });
  }
  if (game.currentPhase === 'done') {
    return res.status(403).json({ error: 'Outcomes are locked - game is over' });
  }
  if (game.revealDeadline && new Date() >= new Date(game.revealDeadline)) {
    return res.status(403).json({ error: 'Reveal phase has ended - outcomes are locked' });
  }

  const { prediction_id, happened } = req.body;

  if (prediction_id === undefined) return res.status(400).json({ error: 'prediction_id required' });
  // Happened or not, or null to clear the mark; a missing value must not count as "didn't happen"
  if (![true, false, null, 'true', 'false'].includes(happened)) {
    return res.status(400).json({ error: 'happened must be true, false or null' });
  }

  const pred = db
    .select()
    .from(predictions)
    .where(and(eq(predictions.id, parseInt(prediction_id)), eq(predictions.gameId, game.id)))
    .get();
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  if (pred.targetId !== me.id) return res.status(403).json({ error: 'Only the target can mark outcomes' });

  const happenedVal = happened === null ? null : happened === true || happened === 'true';
  db.insert(outcomes)
    .values({ predictionId: pred.id, happened: happenedVal, markedBy: me.id })
    .onConflictDoUpdate({
      target: outcomes.predictionId,
      set: { happened: happenedVal, markedBy: me.id, markedAt: new Date().toISOString() },
    })
    .run();

  // The author gets one notification per prediction, saying how it was last marked
  const existingNotifs = db
    .select({ id: notifications.id, meta: notifications.meta })
    .from(notifications)
    .where(and(eq(notifications.userId, pred.authorId), eq(notifications.type, 'outcome_marked')))
    .all()
    .filter(n => {
      try {
        return JSON.parse(n.meta ?? '{}').predictionId === pred.id;
      } catch {
        return false;
      }
    });
  for (const n of existingNotifs) {
    db.delete(notifications).where(eq(notifications.id, n.id)).run();
  }
  if (happenedVal !== null) {
    const target = db.select({ name: users.name }).from(users).where(eq(users.id, me.id)).get();
    db.insert(notifications)
      .values({
        userId: pred.authorId,
        type: 'outcome_marked',
        authorId: me.id,
        meta: JSON.stringify({ targetName: target?.name ?? 'Someone', happened: happenedVal, predictionId: pred.id }),
      })
      .run();
  }

  res.json({ success: true });
});

export default router;
