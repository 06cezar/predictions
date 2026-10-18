import { Router } from 'express';
import { db } from '../db';
import { predictions, predictionHistory, ratings, users, notifications } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { Game, isSubmissionOpen } from '../services/games';
import { GameSnapshot, Prediction, loadSnapshot, roundedAvgRating } from '../services/snapshot';

const router = Router();

const MAX_PREDICTION_LENGTH = 500;
const TOO_LONG = `Keep predictions under ${MAX_PREDICTION_LENGTH} characters`;

/** The author's name, unless the game keeps predictions anonymous. */
function authorName(p: Prediction, g: GameSnapshot, game: Game) {
  return game.anonymousPredictions ? undefined : g.userName(p.authorId);
}

router.get('/mine', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  const g = loadSnapshot(game.id);

  res.json(
    g.predictions
      .filter(p => p.authorId === me.id)
      .map(p => ({
        id: p.id,
        targetId: p.targetId,
        targetName: g.userName(p.targetId),
        currentText: p.currentText,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        editCount: g.history(p.id).length,
        avgRating: roundedAvgRating(g, p.id),
        ratingThreshold: game.ratingThreshold,
      })),
  );
});

router.post('/', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  if (!isSubmissionOpen(game)) {
    return res.status(403).json({ error: 'Submission period has ended' });
  }

  const { text } = req.body;
  const targetId = parseInt(req.body.target_id);
  if (!targetId || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'target_id and text are required' });
  }
  if (text.trim().length > MAX_PREDICTION_LENGTH) return res.status(400).json({ error: TOO_LONG });
  if (targetId === me.id) {
    return res.status(400).json({ error: 'Cannot write a prediction about yourself' });
  }

  const target = db
    .select()
    .from(users)
    .where(and(eq(users.id, targetId), eq(users.gameId, game.id)))
    .get();
  if (!target) return res.status(404).json({ error: 'Target user not found' });

  const existing = db
    .select()
    .from(predictions)
    .where(and(eq(predictions.authorId, me.id), eq(predictions.targetId, targetId)))
    .get();
  if (existing) return res.status(409).json({ error: 'Prediction already exists, use PUT to edit' });

  const result = db
    .insert(predictions)
    .values({
      gameId: game.id,
      authorId: me.id,
      targetId,
      currentText: text.trim(),
    })
    .returning()
    .get();

  db.insert(notifications).values({ userId: targetId, type: 'prediction_about_you', authorId: me.id }).run();

  res.json(result);
});

router.put('/:id', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  if (!isSubmissionOpen(game)) {
    return res.status(403).json({ error: 'Submission period has ended' });
  }

  const pred = db
    .select()
    .from(predictions)
    .where(and(eq(predictions.id, parseInt(req.params.id)), eq(predictions.gameId, game.id)))
    .get();
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  if (pred.authorId !== me.id) return res.status(403).json({ error: 'Not your prediction' });

  const { text } = req.body;
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });
  if (text.trim().length > MAX_PREDICTION_LENGTH) return res.status(400).json({ error: TOO_LONG });

  // Saving the same text again is not an edit: it would cost half a point and clear the ratings
  if (text.trim() === pred.currentText) return res.json(pred);

  // The edit is kept for the score penalty and the Hall of Fame; the old ratings were for the old text
  db.insert(predictionHistory).values({ predictionId: pred.id, oldText: pred.currentText }).run();
  db.delete(ratings).where(eq(ratings.predictionId, pred.id)).run();

  const updated = db
    .update(predictions)
    .set({ currentText: text.trim(), updatedAt: new Date().toISOString() })
    .where(eq(predictions.id, pred.id))
    .returning()
    .get();

  // One "wrote a prediction about you" notification per author, however often they edit
  db.delete(notifications)
    .where(
      and(
        eq(notifications.userId, pred.targetId),
        eq(notifications.type, 'prediction_about_you'),
        eq(notifications.authorId, me.id),
      ),
    )
    .run();
  db.insert(notifications).values({ userId: pred.targetId, type: 'prediction_about_you', authorId: me.id }).run();

  res.json(updated);
});

router.get('/to-rate', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  const g = loadSnapshot(game.id);

  // You rate the other predictions about the friends you wrote about, never your own or those about you
  const myTargets = new Set(g.predictions.filter(p => p.authorId === me.id).map(p => p.targetId));
  const myRatings = new Map(g.allRatings.filter(r => r.userId === me.id).map(r => [r.predictionId, r.score]));
  const rateable = g.predictions.filter(p => p.authorId !== me.id && p.targetId !== me.id && myTargets.has(p.targetId));

  res.json(
    rateable.map(p => ({
      id: p.id,
      targetName: g.userName(p.targetId),
      currentText: p.currentText,
      updatedAt: p.updatedAt,
      editCount: g.history(p.id).length,
      avgRating: roundedAvgRating(g, p.id),
      myRating: myRatings.get(p.id) ?? null,
      authorName: authorName(p, g, game),
    })),
  );
});

router.get('/about-me', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;
  if (game.currentPhase === 'submission') {
    return res.status(403).json({ error: 'Not available during submission phase' });
  }
  const g = loadSnapshot(game.id);

  res.json(
    g.predictions
      .filter(p => p.targetId === me.id)
      .map(p => {
        const outcome = g.outcome(p.id);
        return {
          id: p.id,
          currentText: p.currentText,
          updatedAt: p.updatedAt,
          editCount: g.history(p.id).length,
          avgRating: roundedAvgRating(g, p.id),
          authorName: authorName(p, g, game),
          outcome: outcome ? { happened: outcome.happened, markedAt: outcome.markedAt } : null,
        };
      }),
  );
});

export default router;
