import { Router } from 'express';
import { db } from '../db';
import { predictions, predictionHistory, ratings, users, outcomes, notifications } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { isSubmissionOpen } from '../services/games';
import { getAvgRating } from '../services/ratings';

const router = Router();

const MAX_PREDICTION_LENGTH = 500;
const TOO_LONG = `Keep predictions under ${MAX_PREDICTION_LENGTH} characters`;

router.get('/mine', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  const mine = db.select().from(predictions).where(eq(predictions.authorId, me.id)).all();

  const result = mine.map(p => {
    const history = db.select().from(predictionHistory)
      .where(eq(predictionHistory.predictionId, p.id)).all();
    const target = db.select({ id: users.id, name: users.name }).from(users)
      .where(eq(users.id, p.targetId)).get();
    const avgRating = getAvgRating(p.id);

    return {
      id: p.id,
      targetId: p.targetId,
      targetName: target?.name,
      currentText: p.currentText,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      editCount: history.length,
      avgRating,
      ratingThreshold: game.ratingThreshold,
    };
  });

  res.json(result);
});

router.post('/', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  if (!isSubmissionOpen(game)) {
    return res.status(403).json({ error: 'Submission period has ended' });
  }

  const { target_id, text } = req.body;

  if (!target_id || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'target_id and text are required' });
  }
  if (text.trim().length > MAX_PREDICTION_LENGTH) return res.status(400).json({ error: TOO_LONG });
  if (parseInt(target_id) === me.id) {
    return res.status(400).json({ error: 'Cannot write a prediction about yourself' });
  }

  const target = db.select().from(users)
    .where(and(eq(users.id, parseInt(target_id)), eq(users.gameId, game.id))).get();
  if (!target) return res.status(404).json({ error: 'Target user not found' });

  const existing = db.select().from(predictions)
    .where(and(eq(predictions.authorId, me.id), eq(predictions.targetId, parseInt(target_id))))
    .get();
  if (existing) return res.status(409).json({ error: 'Prediction already exists, use PUT to edit' });

  const result = db.insert(predictions).values({
    gameId: game.id,
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
  const { user: me, game } = res.locals;
  if (!isSubmissionOpen(game)) {
    return res.status(403).json({ error: 'Submission period has ended' });
  }

  const predId = parseInt(req.params.id);

  const pred = db.select().from(predictions)
    .where(and(eq(predictions.id, predId), eq(predictions.gameId, game.id))).get();
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  if (pred.authorId !== me.id) return res.status(403).json({ error: 'Not your prediction' });

  const { text } = req.body;
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });
  if (text.trim().length > MAX_PREDICTION_LENGTH) return res.status(400).json({ error: TOO_LONG });

  // Saving the same text again is not an edit: it would cost half a point and clear the ratings
  if (text.trim() === pred.currentText) return res.json(pred);

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
  const { user: me, game } = res.locals;

  // Targets I have already written a prediction for
  const myPredictions = db.select({ targetId: predictions.targetId })
    .from(predictions).where(eq(predictions.authorId, me.id)).all();
  const myTargetIds = new Set(myPredictions.map(p => p.targetId));

  // Predictions where I am NOT the author AND NOT the target AND target is someone I wrote about
  const all = db.select().from(predictions).where(eq(predictions.gameId, game.id)).all();
  const rateable = all.filter(p =>
    p.authorId !== me.id &&
    p.targetId !== me.id &&
    myTargetIds.has(p.targetId)
  );

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
    if (!game.anonymousPredictions) {
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
  const { user: me, game } = res.locals;
  if (game.currentPhase === 'submission') {
    return res.status(403).json({ error: 'Not available during submission phase' });
  }

  const mine = db.select().from(predictions).where(eq(predictions.targetId, me.id)).all();

  const result = mine.map(p => {
    const history = db.select().from(predictionHistory)
      .where(eq(predictionHistory.predictionId, p.id)).all();
    const avgRating = getAvgRating(p.id);
    const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();

    // Reveal author name only if anonymous mode is OFF
    let authorName: string | undefined;
    if (!game.anonymousPredictions) {
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
