import { Router } from 'express';
import { db } from '../db';
import { predictions, predictionHistory, ratings, settings, users, outcomes, notifications } from '../schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { requireAuth, getCurrentUser } from '../auth';

const router = Router();

function getSettings() {
  return db.select().from(settings).where(eq(settings.id, 1)).get()!;
}

function isSubmissionOpen(s: ReturnType<typeof getSettings>) {
  if (s.adminOverride) return true;
  if (s.currentPhase !== 'submission') return false;
  if (s.submissionDeadline) {
    return new Date() < new Date(s.submissionDeadline);
  }
  return true;
}

function getAvgRating(predictionId: number): number | null {
  const ratingRows = db.select({ score: ratings.score }).from(ratings)
    .where(eq(ratings.predictionId, predictionId)).all();
  if (ratingRows.length === 0) return null;
  return Math.round(ratingRows.reduce((s, r) => s + r.score, 0) / ratingRows.length);
}

router.get('/mine', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;
  const mine = db.select().from(predictions).where(eq(predictions.authorId, me.id)).all();

  const result = mine.map(p => {
    const history = db.select().from(predictionHistory)
      .where(eq(predictionHistory.predictionId, p.id)).all();
    const target = db.select({ id: users.id, name: users.name }).from(users)
      .where(eq(users.id, p.targetId)).get();
    const avgRating = getAvgRating(p.id);
    const s = getSettings();

    return {
      id: p.id,
      targetId: p.targetId,
      targetName: target?.name,
      currentText: p.currentText,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      editCount: history.length,
      avgRating,
      ratingThreshold: s.ratingThreshold,
    };
  });

  res.json(result);
});

router.post('/', requireAuth, (req, res) => {
  const s = getSettings();
  if (!isSubmissionOpen(s)) {
    return res.status(403).json({ error: 'Submission period has ended' });
  }

  const me = getCurrentUser(req)!;
  const { target_id, text } = req.body;

  if (!target_id || !text?.trim()) {
    return res.status(400).json({ error: 'target_id and text are required' });
  }
  if (parseInt(target_id) === me.id) {
    return res.status(400).json({ error: 'Cannot write a prediction about yourself' });
  }

  const target = db.select().from(users).where(eq(users.id, parseInt(target_id))).get();
  if (!target) return res.status(404).json({ error: 'Target user not found' });

  const existing = db.select().from(predictions)
    .where(and(eq(predictions.authorId, me.id), eq(predictions.targetId, parseInt(target_id))))
    .get();
  if (existing) return res.status(409).json({ error: 'Prediction already exists, use PUT to edit' });

  const result = db.insert(predictions).values({
    authorId: me.id,
    targetId: parseInt(target_id),
    currentText: text.trim(),
  }).returning().get();

  db.insert(notifications).values({
    userId: parseInt(target_id),
    type: 'prediction_about_you',
    authorId: me.id,
  }).run();

  res.json(result);
});

router.put('/:id', requireAuth, (req, res) => {
  const s = getSettings();
  if (!isSubmissionOpen(s)) {
    return res.status(403).json({ error: 'Submission period has ended' });
  }

  const me = getCurrentUser(req)!;
  const predId = parseInt(req.params.id);

  const pred = db.select().from(predictions).where(eq(predictions.id, predId)).get();
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  if (pred.authorId !== me.id) return res.status(403).json({ error: 'Not your prediction' });

  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  // Save old text to history
  db.insert(predictionHistory).values({
    predictionId: predId,
    oldText: pred.currentText,
  }).run();

  // Clear ratings — text changed, old ratings no longer apply
  db.delete(ratings).where(eq(ratings.predictionId, predId)).run();

  const updated = db.update(predictions)
    .set({ currentText: text.trim(), updatedAt: new Date().toISOString() })
    .where(eq(predictions.id, predId))
    .returning().get();

  // Replace existing prediction_about_you notification for target
  db.delete(notifications)
    .where(and(eq(notifications.userId, pred.targetId), eq(notifications.type, 'prediction_about_you'), eq(notifications.authorId, me.id)))
    .run();
  db.insert(notifications).values({
    userId: pred.targetId,
    type: 'prediction_about_you',
    authorId: me.id,
  }).run();

  res.json(updated);
});

router.get('/to-rate', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;

  // Targets I have already written a prediction for
  const myPredictions = db.select({ targetId: predictions.targetId })
    .from(predictions).where(eq(predictions.authorId, me.id)).all();
  const myTargetIds = new Set(myPredictions.map(p => p.targetId));

  // Predictions where I am NOT the author AND NOT the target AND target is someone I wrote about
  const all = db.select().from(predictions).all();
  const rateable = all.filter(p =>
    p.authorId !== me.id &&
    p.targetId !== me.id &&
    myTargetIds.has(p.targetId)
  );

  const s = getSettings();
  const result = rateable.map(p => {
    const history = db.select().from(predictionHistory)
      .where(eq(predictionHistory.predictionId, p.id)).all();
    const target = db.select({ id: users.id, name: users.name }).from(users)
      .where(eq(users.id, p.targetId)).get();
    const avgRating = getAvgRating(p.id);

    // Get my rating
    const myRating = db.select().from(ratings)
      .where(and(eq(ratings.predictionId, p.id), eq(ratings.userId, me.id)))
      .get();

    let authorName: string | undefined;
    if (!s.anonymousPredictions) {
      const author = db.select({ name: users.name }).from(users)
        .where(eq(users.id, p.authorId)).get();
      authorName = author?.name;
    }

    return {
      id: p.id,
      targetName: target?.name,
      currentText: p.currentText,
      updatedAt: p.updatedAt,
      editCount: history.length,
      avgRating,
      myRating: myRating?.score ?? null,
      authorName,
    };
  });

  res.json(result);
});

router.get('/about-me', requireAuth, (req, res) => {
  const s = getSettings();
  if (s.currentPhase === 'submission') {
    return res.status(403).json({ error: 'Not available during submission phase' });
  }

  const me = getCurrentUser(req)!;
  const mine = db.select().from(predictions).where(eq(predictions.targetId, me.id)).all();

  const result = mine.map(p => {
    const history = db.select().from(predictionHistory)
      .where(eq(predictionHistory.predictionId, p.id)).all();
    const avgRating = getAvgRating(p.id);
    const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();

    // Reveal author name only if anonymous mode is OFF
    let authorName: string | undefined;
    if (!s.anonymousPredictions) {
      const author = db.select({ name: users.name }).from(users)
        .where(eq(users.id, p.authorId)).get();
      authorName = author?.name;
    }

    return {
      id: p.id,
      currentText: p.currentText,
      updatedAt: p.updatedAt,
      editCount: history.length,
      avgRating,
      authorName,
      outcome: outcome ? { happened: outcome.happened, markedAt: outcome.markedAt } : null,
    };
  });

  res.json(result);
});

export default router;
